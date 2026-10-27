This is the frontend for the Electronics Manufacturing Capstone Project.
It shows results from the backend machine learning model. To load the latest
export without selecting a file, run `python api.py` from the backend project
directory and open `http://127.0.0.1:8000/`. The API serves this frontend and
provides `GET /api/inspection-report`; generate or refresh the report first
with `python export_results.py` in the backend directory.
