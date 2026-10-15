# Tax Workpaper

A small browser-based workpaper demo. It uses the sample data in `data/packet.json`.

## Run it on Windows

Open this folder in VS Code, then choose **Terminal → New Terminal**. Make sure the terminal is in the folder containing `index.html`. If it isn't, go there with:

```powershell
cd "C:\path\to\Redesign-the-Tax-Workpaper"
```

Start the local web server:

```powershell
python -m http.server 8000
```

If `python` isn't recognized, try:

```powershell
py -m http.server 8000
```

Open **http://localhost:8000/** in your browser. Leave the terminal open while you use the app. Press **Ctrl+C** in the terminal when you're finished.

The app needs to be served over HTTP because it loads its data with `fetch`. No build or install step is needed.

If Python isn't available, install the **Live Server** extension in VS Code, right-click `index.html`, and choose **Open with Live Server**.
