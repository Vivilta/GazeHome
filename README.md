# GazeHome

GazeHome is a React + Vite prototype for webcam-based gaze control of four home appliances. It simulates a BCI-style interface: the user looks at an appliance card for a configurable dwell time, and the appliance changes state after the dwell threshold is reached.

The project supports:

- Manual Mode for free appliance interaction.
- Experiment Mode for randomized commands, reaction-time logging, accuracy metrics, surveys, and CSV export.
- Demo Sim for testing gaze interaction with the mouse, without a camera.
- 9-point WebGazer calibration and an independent 5-point accuracy check.
- Dwell-time options of `0.5 s`, `1.0 s`, and `1.5 s`.

> This is a webcam gaze-tracking prototype. It does not use EEG or other neural hardware, and it is not a medical device.

## 1. Requirements

- Node.js `20.19+` or `22.12+`. Node.js 24 and npm 11 have been used successfully with the current project.
- npm.
- A modern browser such as Chrome or Edge for webcam tracking.
- A working webcam for real gaze tracking. Demo Sim and mouse clicks work without a webcam.
- Internet access when using real gaze tracking, because WebGazer is loaded from a CDN at runtime.

No Gemini API key is required for the current application. The UI does not currently call the Gemini API.

## 2. Install and Start

Open Terminal and run:

```bash
cd /Users/vivi/Documents/BN5213/gazehome
npm install
npm run dev
```

Then open:

```text
http://localhost:3000/
```

Keep the terminal window running while using the app. Press `Ctrl+C` in that terminal to stop the development server.

If port `3000` is already occupied, Vite may select the next available port. Always use the URL printed in the terminal.

## 3. First-Time Camera Setup

1. Open the app at `http://localhost:3000/`.
2. Click `Start Tracking` in the header or in the `Actions & Calibration` panel.
3. When the browser asks for camera access, choose `Allow`.
4. In `Set up your camera position`, make sure the face and both eyes are visible in the preview.
5. Sit at a comfortable distance, face the screen, use steady lighting, and keep the head roughly still. Small natural movements and blinking are acceptable.
6. Click `Begin 9-point calibration`.

## 4. Calibration Procedure

### 4.1 9-point calibration

The blue target is shown sequentially at nine screen positions. For each position:

1. Look directly at the blue target.
2. Click the target five times while continuing to look at it.
3. Wait for the next target to appear.

The clicks provide WebGazer with screen-coordinate training samples. The blue number shows how many clicks remain for the current point.

### 4.2 Independent accuracy check

After all nine points are completed, the app automatically starts a separate five-point validation phase:

1. Look at the displayed green or blue validation target.
2. Do not click it.
3. Keep your gaze on it until the progress bar completes.
4. Repeat for all five validation points.

The app reports the number of samples, median error, and the percentage of samples inside the tolerance. Click `Use calibration and start tracking` to enter the main interface. If the result is poor, use `Retry calibration` or first use `Adjust camera`.

During calibration, WebGazer uses a Ridge regression model, Kalman filtering, and an additional smoothing step. The validation result is an estimate from a normal webcam, not laboratory-grade ground truth.

## 5. Using the Main Interface

### Manual Mode

Manual Mode is the quickest way to check that the interface works:

- Click an appliance card to toggle its `ON` / `OFF` state.
- With tracking active, look at an appliance card and hold your gaze until the dwell progress reaches the selected threshold.
- The dwell progress appears inside the focused appliance card. Moving your gaze away resets the progress.
- Select the dwell threshold in `Dwell Time Threshold`: `0.5 s`, `1.0 s`, or `1.5 s`.
- Use `Turn All OFF` to reset all four appliances.

The four appliance targets are `LIGHT`, `FAN`, `TV`, and `AC`.

### Demo Sim

`Demo Sim` uses the mouse cursor as a simulated gaze point and does not request camera permission:

1. Click `Demo Sim` in the header.
2. Move the mouse into an appliance card.
3. Keep the pointer inside the card until the dwell progress completes.
4. Move the pointer away before trying to trigger the same card again.

Use this mode to check layout, dwell feedback, and appliance state changes before testing with a webcam. The header shows `Demo Simulation (Mouse)` while it is enabled.

### Experiment Mode

Experiment Mode records real interaction results for later analysis:

1. Select `Experiment Mode`.
2. Enter a participant ID in the `Participant Session` panel, for example `P01`.
3. Select a dwell-time condition.
4. Click `Start Experiment Block` in the command banner.
5. Read the command, look at the requested appliance, and hold your gaze until the dwell action is triggered.
6. Use `Pause`, `Resume`, or `End Block` when needed.
7. Review accuracy, error rate, mean correct latency, and trial history in the right-hand panel.
8. Use `Export CSV` to download the recorded trials, or `Survey` to enter post-session feedback.

In Experiment Mode, selecting the wrong appliance records an error trial but does not change the requested appliance state. Trial metrics are generated from the current session only.

## 6. Useful Commands

```bash
# Start the development server with hot reload
npm run dev

# Type-check the project
npm run lint

# Create a production build in dist/
npm run build

# Preview the production build locally
npm run preview

# Remove generated build output
npm run clean
```

For a production preview, run `npm run build` first and then `npm run preview`. Use the URL printed by Vite, which is commonly `http://localhost:4173/`.

## 7. Troubleshooting

### The page is blank after starting

- Check the terminal for TypeScript or Vite errors.
- Confirm that `npm install` completed successfully.
- Stop an old dev server and run `npm run dev` again.
- Hard-refresh the browser page.
- If the terminal reports a different port, open that port instead of `3000`.

### The camera permission dialog does not appear

- Check the browser's site permissions for `localhost` and allow Camera.
- Make sure another application is not exclusively using the webcam.
- Stop the app with `Stop Tracking`, refresh the page, and try `Start Tracking` again.
- `Demo Sim` can be used while camera access is being diagnosed.

### The camera preview is black or only partly visible

- Check that the correct webcam is selected in the browser or operating-system privacy settings.
- Make sure the camera is not covered and that the room has enough light.
- Use the preview in the setup screen to reposition the camera so both eyes and the face are visible.
- If the preview is still incorrect, stop tracking, refresh the page, and start the setup again.

### WebGazer cannot load

Real tracking loads WebGazer from `https://cdn.jsdelivr.net/npm/webgazer@3.3.0/dist/webgazer.js`, with a secondary CDN fallback. Check the network connection, firewall, or campus network restrictions. Mouse clicks and `Demo Sim` do not need WebGazer.

### Calibration accuracy is low

- Keep the face and both eyes visible throughout setup and calibration.
- Keep the head roughly still while looking at each point; normal blinking is fine.
- Avoid strong backlight, glare, and changing lighting.
- Sit at a comfortable, stable distance from the screen.
- Recalibrate after changing the camera position, screen position, lighting, or seating posture.
- Use the validation result to decide whether to retry rather than relying only on the moving gaze marker.

### Gaze selection triggers unexpectedly

- Increase the dwell threshold to `1.0 s` or `1.5 s`.
- Keep the gaze outside appliance cards while reading the command banner.
- Recalibrate if the gaze estimate is drifting.
- Use `Pause` in Experiment Mode when discussing or changing the setup.

## 8. Project Structure

```text
gazehome/
├── src/
│   ├── components/          # Header, calibration, appliance, experiment, and control UI
│   ├── hooks/               # WebGazer lifecycle and dwell-selection state machine
│   ├── services/            # WebGazer script loading and cleanup
│   ├── utils/               # Audio feedback and CSV export helpers
│   ├── App.tsx              # Main application state and mode flow
│   ├── index.css            # Global styles and Tailwind entry point
│   ├── main.tsx             # React entry point
│   └── types.ts             # Shared TypeScript types
├── index.html               # HTML entry point and metadata
├── package.json              # Scripts and dependencies
├── package-lock.json         # Locked dependency versions
├── vite.config.ts            # Vite, React, and Tailwind configuration
└── .env.example              # Notes that no runtime variables are currently required
```

## 9. Handing the Project to Another Group Member

Share the project source together with `package.json`, `package-lock.json`, `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, and this README. Do not share `node_modules/`; the next person should recreate it with `npm install`.

Recommended handoff checklist:

1. Confirm the recipient has Node.js and npm installed.
2. Send the project folder or repository, including `package-lock.json`.
3. Ask the recipient to run `npm install` and then `npm run dev`.
4. Ask them to verify `npm run lint` and `npm run build` before changing code.
5. When testing gaze tracking, use `localhost`, allow camera access, and record the browser, webcam, lighting, and calibration result.
6. Do not commit API keys, `.env.local`, camera recordings, or generated `dist/` / `node_modules/` directories.

## 10. Current Technical Notes

- Gaze tracking is implemented with WebGazer loaded dynamically in the browser.
- The app disables WebGazer's default prediction dot and renders its own optional gaze reticle.
- Calibration data is reset for the current session before calibration to avoid mixing data from another user or posture.
- Camera tracking and validation are browser-side only. No gaze data is sent to a project backend by the current implementation.
