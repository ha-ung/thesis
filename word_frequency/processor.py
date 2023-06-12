from tika import parser
import timeit
from collections import Counter
from dotenv import load_dotenv
from datetime import datetime
from database import Database
from producer import Producer
from file_manager import get_file_from_bucket, remove_file_from_dir, write_to_bucket, get_text_from_bucket

import uuid
import os
import re
import openai


load_dotenv()

def remove_element(list, element):
    for x in list:
        if x[0].lower() == element:
            list.remove(x)
    return list


def eliminate_most_common(frequency_list):
    # text_list = []
    # with open("most_common.txt") as file:
    #     text_list = file.read().splitlines()
    text_list = get_text_from_bucket("requirements/" + os.environ.get("APP_NAME") + "/requirements.txt").splitlines()
    
    words = [x[0].lower() for x in frequency_list]

    for x in words:
        if x in text_list:
            remove_element(frequency_list, x)
    
    new_list = frequency_list
    return new_list


def most_common_words(uploaded_file_location):
    raw_text = parser.from_file(uploaded_file_location)
    text_list = raw_text["content"].splitlines()

    filtered_list = [word for word in list(map(str.strip, text_list)) if word != '']
    digit_regex = re.compile("\d(.)*")

    semifinal_list = []
    for sentence in filtered_list:
        for x in sentence.split(" "):
            semifinal_list.append(x)

    final_list = []
    for i in range(len(semifinal_list)):
        if re.match(digit_regex, semifinal_list[i]) is None:
            final_list.append(semifinal_list[i])

    frequency = Counter(final_list)
    frequency_list = eliminate_most_common(frequency.most_common())

    return frequency_list


def get_abstract(uploaded_file_location):
    raw_text = parser.from_file(uploaded_file_location)
    text_list = raw_text["content"]
    truncate_text = [word for word in list(map(str.strip, text_list.splitlines())) if word != '']
    
    abstract_regex = re.compile("(A(?:bstract|BSTRACT))( )*$")
    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER)) (\d)+(\.)?[ \n]*([A-Z][a-z/A-Z ]*)?$)")

    start = ""
    end = ""
    start_index = 0
    end_index = 0

    for index, word in enumerate(truncate_text):
        if re.findall(abstract_regex, word) and not start:
            start = re.findall(abstract_regex, word)
            start_index = index
            
        if re.findall(chapter_regex, word) and not end:
            end = re.findall(chapter_regex, word)
            end_index = index
            break
            
    if start and end:
        abstract_content = ""
        for i in range(start_index, end_index):
            abstract_content += truncate_text[i] + " "
        return abstract_content

    return ""


def get_keywords(text):
    model = "text-davinci-003"
    openai.api_key = os.environ.get("OPENAI_API_KEY")
    summary = openai.Completion.create(model=model, prompt=("Extract keywords from this text:\n\n" + text) , max_tokens=30, temperature=0.5, top_p=1.0, frequency_penalty=0.8, presence_penalty=0.0)
    return summary["choices"][0]["text"]


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
    word_frequency_list = most_common_words(uploaded_file_location)
    
    abstract_content = get_abstract(uploaded_file_location)
    keywords = ""
    if abstract_content:
        keywords = get_keywords(abstract_content)

    file_name = os.path.basename(cloud_file_location).split(".")[0]
    output = ""

    output = "Most common words in this thesis: \n"
    for i in range(len(word_frequency_list)):
        if i < 10:
            output += str(word_frequency_list[i])
            output += "\n"

    if keywords:
        output += "\n"
        output += "Keywords extracted from Abstract: \n"
        output += keywords.replace("\n", "")

    output_file_location = write_to_bucket(file_name, output)

    print("\nTime for " + os.environ.get("APP_NAME") + " to process file " + file_name + " is " + str(timeit.default_timer() - start_time) + "\n")
    print("finished uploading to bucket for " + os.environ.get("APP_NAME"))

    remove_file_from_dir(uploaded_file_location)
    
    insert_database(output_file_location)

    producer = Producer()
    producer.publish_message(output_file_location)

    print("Processing complete in " + os.environ.get("APP_NAME"))
