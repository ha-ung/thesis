import re
import os
import uuid
import timeit

from tika import parser
from difflib import SequenceMatcher
from dotenv import load_dotenv
from datetime import datetime
from database import Database
from producer import Producer
from file_manager import get_file_from_bucket, remove_file_from_dir, write_to_bucket, get_text_from_bucket

load_dotenv()

def check_format(uploaded_file_location):
    raw_text = parser.from_file(uploaded_file_location)
    text_list = raw_text["content"]

    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER)) (\d)+(\.)?[ \n]*([A-Z][a-z/A-Z&/\- ]*)|(R(?:eferences|EFERENCES))|(A(?:bstract|BSTRACT))|(A(?:ppendix|PPENDIX)))( )*(\n)+")
    chapter_title_tuple_list = re.findall(chapter_regex, text_list)
    chapter_title_list = [list(element) for element in chapter_title_tuple_list]

    final_chapter_title_list = []

    for chapter in chapter_title_list:
        chapter = list(filter(lambda x: x != "" and x != "\n" and x != " " and x != ".", chapter))
        for i in range(len(chapter)):
            chapter[i] = chapter[i].strip()
        final_chapter_title_list.append(chapter)

    return final_chapter_title_list


def check_with_template(text_list, title_list):
    count = 10
    different_list = []
    
    for chapter in text_list:
        if (chapter.upper() not in title_list) and (chapter not in title_list):
            count -= 1
            different_list.append(chapter)

    for i in range(len(different_list)):
        for j in range(len(title_list)):
            if (different_list[i][:9] == title_list[j][:9] or different_list[i][:9].upper() == title_list[j][:9]):
                count += SequenceMatcher(None, different_list[i].lower(), title_list[j].lower()).ratio()

    count = count * 10
    return str(round(count, 1)) + "%", different_list


def generate_report(chapter_title_list):
    # text_list = []
    title_list = []

    text_list = get_text_from_bucket("requirements/" + os.environ.get("APP_NAME") + "/requirements.txt").splitlines()
    text_list = [line.rstrip("\n") for line in text_list]

    # with open("template.txt") as file:
    #     text_list = [line.rstrip("\n") for line in file]
    
    for chapter in chapter_title_list:
        title_list.append(" ".join(chapter))

    percent, different_list = check_with_template(text_list, title_list)
    return text_list, title_list, percent, different_list


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

    chapter_title_list = check_format(uploaded_file_location)
    text_list, title_list, percent, different_list = generate_report(chapter_title_list)

    file_name = os.path.basename(cloud_file_location).split(".")[0]
    output = ""

    output += "Chapter titles according to template: \n"
    for x in text_list:
        output += str(x) + "\n"
    output += "\n"

    output += "Chapter titles detected in document: \n"
    for x in title_list:
        output += str(x) + "\n"
    output += "\n"

    if len(different_list) > 0:
        output += "Missing or incorrect titles:\n"
        for x in different_list:
            output += str(x) + "\n"
        output += "\n"

    output += "Similarity percentage: " + percent

    output_file_location = write_to_bucket(file_name, output)
    print("\nTime for " + os.environ.get("APP_NAME") + " to process file " + file_name + " is " + str(timeit.default_timer() - start_time) + "\n")

    print("finished uploading to bucket for " + os.environ.get("APP_NAME"))

    remove_file_from_dir(uploaded_file_location)
    
    insert_database(output_file_location)

    producer = Producer()
    producer.publish_message(output_file_location)

    print("Processing complete in " + os.environ.get("APP_NAME"))

    # try:
    #     os.makedirs(os.path.dirname(final_path))
    # except OSError as exc:
    #     if exc.errno != errno.EEXIST:
    #         raise

    # f = open(final_path, "w", encoding="utf-8")

    # f.write("Chapter titles according to template: \n")
    # for x in text_list:
    #     f.write(str(x) + "\n")
    # f.write("\n")
    
    # f.write("Chapter titles detected in document: \n")
    # for x in title_list:
    #     f.write(str(x) + "\n")
    # f.write("\n")

    # if len(different_list) > 0:
    #     f.write("Missing or incorrect titles:\n")
    #     for x in different_list:
    #         f.write(str(x) + "\n")
    # f.write("\n")

    # f.write("Similarity percentage: ")
    # f.write(percent)

    # print("finished format_check, output path = " + final_path)
    # return final_path
