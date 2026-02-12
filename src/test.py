import tkinter as tk
from tkinter import messagebox
import json
import os

FILE_PATH = "./config/location.json"


def load_json():
    if not os.path.exists(FILE_PATH):
        return {"x": 0, "y": 0, "floor": 0}
    
    with open(FILE_PATH, "r") as f:
        return json.load(f)


def save_json(data):
    with open(FILE_PATH, "w") as f:
        json.dump(data, f, indent=2)


def save_data():
    try:
        data = {
            "x": int(entry_x.get()),
            "y": int(entry_y.get()),
            "floor": int(entry_floor.get())
        }
        save_json(data)
        messagebox.showinfo("Success", "Saved successfully!")
    except ValueError:
        messagebox.showerror("Error", "Please enter valid integers.")


# ================= UI =================

root = tk.Tk()
root.title("JSON Editor")
root.geometry("300x200")

data = load_json()

tk.Label(root, text="X:").pack()
entry_x = tk.Entry(root)
entry_x.insert(0, data["x"])
entry_x.pack()

tk.Label(root, text="Y:").pack()
entry_y = tk.Entry(root)
entry_y.insert(0, data["y"])
entry_y.pack()

tk.Label(root, text="Floor:").pack()
entry_floor = tk.Entry(root)
entry_floor.insert(0, data["floor"])
entry_floor.pack()

tk.Button(root, text="Save", command=save_data).pack(pady=10)

root.mainloop()
