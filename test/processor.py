import re
import os
import uuid
import openai
import tiktoken

from dotenv import load_dotenv
from datetime import datetime
from tika import parser
from langchain.text_splitter import RecursiveCharacterTextSplitter

load_dotenv()
openai.api_key = os.environ.get("OPENAI_API_KEY")
encoding = tiktoken.encoding_for_model("text-davinci-003")

def extract_text(uploaded_file_location):
    raw_text = parser.from_file(uploaded_file_location)
    text_list = raw_text["content"]

    return text_list


def extract_chapter_title(text):
    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER)) (\d)+(\.)?[ \n]*([A-Z][a-z/A-Z&/\- ]*)|(R(?:eferences|EFERENCES)))( )*(\n)+")
    chapter_title_list = []
    chapters = []

    chapter_matches = re.finditer(chapter_regex, text)
    for match in chapter_matches:
        chapter_title = match[0].replace("\n", "").split(" ")
        if (len(chapter_title) > 0):
            chapter_title_list.append(str(chapter_title[0] + " " + chapter_title[1]).strip())

    if chapter_title_list[-1].upper() == "REFERENCES":
        chapter_title_list.pop()

    return chapter_title_list


def extract_section_title(text):
    section_regex = re.compile("(?<!(Figure))( )+([1-9]([0-9]*)(\.)){1,2}( )+")
    section_title_list = []

    section_matches = re.finditer(section_regex, text)
    for match in section_matches:
        section_title_list.append(match[0])

    return section_title_list


def extract_chapter_content(text):
    chapter_title_list = extract_chapter_title(text)
    section_title_list = []

    chapter_content = []
    truncate_text = [word for word in list(map(str.strip, text.splitlines())) if word != '']

    for i in range(len(chapter_title_list)):
        chapter = ""

        if i != (len(chapter_title_list) - 1):
            start = chapter_title_list[i]
            end = chapter_title_list[i + 1]

            start_index = truncate_text.index(start)
            end_index = truncate_text.index(end)        

            for j in range(start_index, end_index):
                chapter += truncate_text[j] + " "

            chapter_content.append(chapter)
            section_title_list.append(extract_section_title(chapter))
        else:
            if chapter_title_list[i].upper() != ("REFERENCES" or "REFERENCE"):
                start = chapter_title_list[i]

                start_index = truncate_text.index(start)
                end_index = len(truncate_text) - 1

                for k in range(start_index, end_index):
                    if (truncate_text[k].upper() == ("REFERENCES" or "REFERENCE")):
                        break
                    else:
                        chapter += truncate_text[k] + " "

                chapter_content.append(chapter)
                section_title_list.append(extract_section_title(chapter))

    chapter_regex = re.compile("(?:(C(?:hapter|HAPTER))( )(\d)+(\.)?( )([A-Z][a-z/A-Z ]*))( )*")
    chapter_titles = []
    for chapter in chapter_content:
        chapter_title = ""
        matches = re.findall(chapter_regex, chapter)

        for match in matches:
            for x in match:
                if x != " ":
                    chapter_title += x + " "
        
        chapter_titles.append(chapter_title.strip())

    section_content = []

    for i, section in enumerate(section_title_list):
        chapter = chapter_content[i]
        chapter_section_content = []
        
        for j in range(len(section)):
            content = ""

            if j != (len(section) - 1):
                start = section[j]
                end = section[j + 1]

                start_index = chapter.index(start)
                end_index = chapter.index(end)

                for k in range(start_index, end_index):
                    content += chapter[k]

                chapter_section_content.append(content)
            else:
                start = section[j]
                
                start_index = chapter.index(start)
                end_index = len(chapter) - 1

                for k in range(start_index, end_index):
                    content += chapter[k]

                chapter_section_content.append(content)

        section_content.append(chapter_section_content)
    
    return (section_content, chapter_titles)


def split_into_chunks(text, max=4000):
    chunks = [[]]
    chunk_total_words = 0

    nlp = spacy.load("en_core_web_sm")

    for sentence in nlp(text).sents:
        chunk_total_words += len(sentence.text.split(" "))

        if chunk_total_words > 10000:
            chunks.append([])
            chunk_total_words = len(sentence.text.split(" "))

        chunks[len(chunks)-1].append(sentence.text)
    
    return chunks


def count_token(text):
    num_token = len(encoding.encode(text))
    return num_token


def chunk_text(text):
    splitter = RecursiveCharacterTextSplitter(chunk_size = 4000, length_function=count_token, separators=['\n\n', '\n', ' ', ''], chunk_overlap=2)
    chunks = splitter.split_text(text)

    return chunks


def summarize_text(text):
    response = openai.Completion.create(
        model="text-davinci-003",
        prompt=text + "Tl;dr",
        temperature=1,
        max_tokens=60,
        top_p=1.0,
        frequency_penalty=0.0,
        presence_penalty=1
    )

    return response["choices"][0]["text"]


def insert_database(file_location):
    file_name = os.path.basename(file_location)
    id = str(uuid.uuid4())
    uploaded_time = datetime.utcnow()

    db = Database()
    db.insert("INSERT INTO output (id, file_name, file_location, uploaded_time) VALUES (%s, %s, %s, %s)", (id, file_name, file_location, uploaded_time))

    print("inserted in db")


def output_file(uploaded_file_location):
    extracted_text = extract_text(uploaded_file_location)
    chapter_titles = extract_chapter_title(extracted_text)
    (chapter_content, chapter_titles) = extract_chapter_content(extracted_text)
    section_summaries = [[] for chapter in chapter_titles]
    chunks = []

    for i in chapter_content:
        chapter_chunks = []
        for j in i:
            chunk = chunk_text(j)
            chapter_chunks.append(chunk)
        chunks.append(chapter_chunks)

    for index, chunk in enumerate(chunks):
        for section in chunk:
            prompt = section[0]
            if (len(prompt) > 300):
                summary = summarize_text(prompt)
                summary = re.sub(re.compile("^:"), "", summary)
                section_summaries[index].append(summary.strip())
            
    for index, chapter in enumerate(section_summaries):
        chapter.insert(0, chapter_titles[index].upper())

    
    for section in section_summaries:
        print(section)