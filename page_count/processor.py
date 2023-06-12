import os
import re
import uuid
import timeit
import pdfplumber

from dotenv import load_dotenv
from datetime import datetime
from database import Database
from producer import Producer
from file_manager import get_file_from_bucket, remove_file_from_dir, write_to_bucket, get_text_from_bucket

load_dotenv()


def get_num_pages(uploaded_file_location):
    num_pages = 1

    with pdfplumber.open(uploaded_file_location) as file:
        for page in file.pages:
            num_pages += 1

    return num_pages


def check_chapter_pages(uploaded_file_location):
    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER)) (\d)+(\.)?( )*(\n)*([A-Z][a-z/A-Z&/\- ]*)|(R(?:eferences|EFERENCES)))( )*(\n)*(?<!\.)(\n|\r|\r\n)")
    chapter_titles = ["CHAPTER 1", "CHAPTER 2", "CHAPTER 3", "CHAPTER 4", "CHAPTER 5", "CHAPTER 6", "REFERENCES"]
    chapter_page_index = {}
    num_pages = get_num_pages(uploaded_file_location)

    with pdfplumber.open(uploaded_file_location) as file:
        for index, page in enumerate(file.pages):
            text = page.extract_text()
            chapter_title_list = re.findall(chapter_regex, text)

            if chapter_title_list:
                if (("References" and "REFERENCES") not in chapter_title_list[0]):
                    chapter = " ".join(chapter_title_list[0][0:2]).upper()
                else:
                    chapter = "REFERENCES"
                
                if chapter in chapter_titles and chapter not in chapter_page_index:
                    chapter_page_index[chapter] = index + 1

        chapter_page_count = {}
        chapter_page_index = [(k,v) for k,v in chapter_page_index.items()]

        for index, chapter in enumerate(chapter_page_index):
            next_index = index + 1
            
            if (next_index < len(chapter_page_index)):
                next_chapter = chapter_page_index[next_index]
                chapter_page_count[chapter[0]] = next_chapter[1] - chapter[1]
            else:
                chapter_page_count[chapter[0]] = num_pages - chapter[1]

    return chapter_page_count


def get_requirements():
    requirements = {}

    text_list = get_text_from_bucket("requirements/" + os.environ.get("APP_NAME") + "/requirements.txt").splitlines()
    text_list = [line.rstrip("\n") for line in text_list]

    # with open("requirements.txt") as file:
    #     text_list = [line.rstrip("\n") for line in file]

    for element in text_list:
        chapter_title = element.split(":")[0].strip()
        page_count = element.split(":")[1].strip()

        requirements[chapter_title] = int(page_count)

    return requirements

    
def check_with_requirements(uploaded_file_location, chapter_page_count):
    requirements = get_requirements()
    result = {}
    num_pages = get_num_pages(uploaded_file_location)

    for chapter in requirements:
        if chapter in chapter_page_count:
            page_count = chapter_page_count[chapter]

            if page_count < requirements[chapter]:
                result[chapter] = "Not enough"
            else:
                result[chapter] = "Exceeded"
        else:
            if chapter == "TOTAL":
                result["Total page count"] = "Not enough" if num_pages < 40 else "Exceeded"
            else:
                result[chapter] = "Not detected"

    return result


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

    chapter_page_count = check_chapter_pages(uploaded_file_location)
    requirements = get_requirements()
    result = check_with_requirements(uploaded_file_location, chapter_page_count)
    
    file_name = os.path.basename(cloud_file_location).split(".")[0]
    output = ""

    output += "Page count required for each chapter: \n"
    for x in requirements:
        output += x + ": " + str(requirements[x]) + "\n"
    output += "\n"
    
    output += "Page count detected in document: \n"
    for x in chapter_page_count:
        output += x + ": " + str(chapter_page_count[x]) + "\n"
    output += "\n"

    output += "Results: \n"
    for x in result:
        output += x + ": " + str(result[x]) + "\n"
    output += "\n"

    output_file_location = write_to_bucket(file_name, output)
    print("\nTime for " + os.environ.get("APP_NAME") + " to process file " + file_name + " is " + str(timeit.default_timer() - start_time) + "\n")

    print("finished uploading to bucket for " + os.environ.get("APP_NAME"))

    remove_file_from_dir(uploaded_file_location)
    
    insert_database(output_file_location)

    producer = Producer()
    producer.publish_message(output_file_location)

    print("Processing complete in " + os.environ.get("APP_NAME"))
