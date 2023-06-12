from tika import parser
from dotenv import load_dotenv
from datetime import datetime
from database import Database
from producer import Producer
from file_manager import get_file_from_bucket, remove_file_from_dir, write_to_bucket, get_text_from_bucket

import os, re
import pdfplumber
import uuid
import timeit

load_dotenv()

def get_template():
    template = get_text_from_bucket("requirements/" + os.environ.get("APP_NAME") + "/requirements.txt").splitlines()
    # with open("formatting_guideline.txt") as file:
    #     template = file.read().splitlines()

    return template


def get_title(uploaded_file_location):
    raw_text = parser.from_file(uploaded_file_location)
    text_list = raw_text["content"]

    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER)) (\d)+(\.)?[ \n]*([A-Z][a-z/A-Z/&\- ]*)|(R(?:eferences|EFERENCES))|(A(?:bstract|BSTRACT))|(A(?:ppendix|PPENDIX)))( )*(\n)+")
    chapter_title_list = []

    chapter_matches = re.finditer(chapter_regex, text_list)
    for match in chapter_matches:
        chapter_title_list.append(match[0])

    section_regex = re.compile("^([1-9]([0-9]*)(\.)){1,2}( )+(([a-zA-Z0-9]+(\s))*[a-zA-Z0-9]*[^.](\n)?){1,2}\n", flags=re.MULTILINE)
    section_title_list = []

    section_matches = re.finditer(section_regex, text_list)
    for match in section_matches:
        section_title_list.append(match[0])

    chapter_list = []
    section_list = []

    for chapter in chapter_title_list:
        new_chapter = chapter.replace("\n", "").strip()
        chapter_list.append(new_chapter)

    for section in section_title_list:
        new_section = section.replace("\n", "").strip()
        section_list.append(new_section)
    
    return [chapter_list, section_list]


def get_bold_text(uploaded_file_location):
    bold_large_text = []
    bold_medium_text = []

    with pdfplumber.open(uploaded_file_location) as file:
        for page in file.pages:
            words = page.extract_words(extra_attrs=["fontname", "size"])

            for word in words:
                if "Bold" in word["fontname"] and round(word["size"]) == 14:
                    bold_large_text.extend(word["text"].replace("\n", " ").split(" "))
                elif "Bold" in word["fontname"] and round(word["size"]) == 13:
                    bold_medium_text.extend(word["text"].split("\n"))

    final_bold_large_text = []
    final_bold_medium_text = []

    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER))|(R(?:eferences|EFERENCES))|(A(?:bstract|BSTRACT)))|(A(?:ppendix|PPENDIX))")
    section_regex = re.compile("([1-9]([0-9]*)(\.)){1,2}")

    chapter_index = -1
    chapter_word = ""
    for i in range(len(bold_large_text)):
        if re.search(chapter_regex, bold_large_text[i]) and i != chapter_index:
            if chapter_word != "":
                final_bold_large_text.append(chapter_word)
            chapter_word = ""
            chapter_index = i
        if i >= chapter_index:
            chapter_word += bold_large_text[i] + " "
        if i == len(bold_large_text) - 1:
            final_bold_large_text.append(chapter_word)

    for i in range(len(final_bold_large_text)):
        final_bold_large_text[i] = final_bold_large_text[i].strip()

    section_index = -1
    section_word = ""
    for i in range(len(bold_medium_text)):
        if re.search(section_regex, bold_medium_text[i]) and i != section_index:
            if section_word != "":
                final_bold_medium_text.append(section_word)
            section_word = ""
            section_index = i
        if i >= section_index:
            section_word += bold_medium_text[i] + " "
        if i == len(bold_medium_text) - 1:
            final_bold_medium_text.append(section_word)
        
    for i in range(len(final_bold_medium_text)):
        final_bold_medium_text[i] = final_bold_medium_text[i].strip()

    return [final_bold_large_text, final_bold_medium_text]


def check_title(uploaded_file_location):
    [chapter_title_list, section_title_list] = get_title(uploaded_file_location)
    [bold_large_text, bold_medium_text] = get_bold_text(uploaded_file_location)
    count_chapter = 0
    count_section = 0

    chapter_check = {}
    section_check = {}

    for word in bold_large_text:
        for chapter in chapter_title_list:
            if word in chapter:
                chapter_check[chapter] = True
                count_chapter += 1
            else: 
                if chapter not in chapter_check:
                    chapter_check[chapter] = False

    for word in bold_medium_text:
        for section in section_title_list:
            if word in section:
                section_check[section] = True
                count_section += 1
            else:
                if section not in section_check:
                    section_check[section] = False

    percent_chapter = round(count_chapter / len(chapter_title_list) * 100)
    percent_section = round(count_section / len(section_title_list) * 100)

    return [str(percent_chapter) + "%", str(percent_section) + "%", chapter_check, section_check]


def insert_database(file_location):
    file_name = os.path.basename(file_location)
    id = str(uuid.uuid4())
    uploaded_time = datetime.utcnow()

    db = Database()
    db.insert("INSERT INTO output (id, file_name, file_location, uploaded_time) VALUES (%s, %s, %s, %s)", (id, file_name, file_location, uploaded_time))

    print("inserted in db")


def output_file(cloud_file_location):
    start_time = timeit.default_timer()
    uploaded_file_location = get_file_from_bucket(cloud_file_location)

    [percent_chapter, percent_section, chapter_check, section_check] = check_title(uploaded_file_location)
    [chapter_title_list, section_title_list] = get_title(uploaded_file_location)
    
    file_name = os.path.basename(cloud_file_location).split(".")[0]
    output = ""

    template = get_template()
    for text in template:
        output += str(text) + "\n"
    output += "\n"

    output += percent_chapter + " of the chapter titles detected this document follow the formatting guideline:\n"
    for chapter in chapter_title_list:
        output += str(chapter)
        if chapter_check[chapter] == False:
            output += " x"
        output += "\n"
    output += "\n"

    output += percent_section + " of the section titles detected in this document follow the formatting guideline:\n"
    for section in section_title_list:
        output += (section[:30] if len(section) > 30 else section)
        if section_check[section] == False:
            output += " x"
        output += "\n"

    output_file_location = write_to_bucket(file_name, output)
    print("\nTime for " + os.environ.get("APP_NAME") + " to process file " + file_name + " is " + str(timeit.default_timer() - start_time) + "\n")

    print("finished uploading to bucket for " + os.environ.get("APP_NAME"))

    remove_file_from_dir(uploaded_file_location)
    
    insert_database(output_file_location)

    producer = Producer()
    producer.publish_message(output_file_location)

    print("Processing complete in " + os.environ.get("APP_NAME"))
