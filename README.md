# Bunbetsu (分別)

**Plan cleaner, better-organized college events.**

**Live Now**: https://bunbetsu.vercel.app/home

Bunbetsu is a campus event-planning tool that helps organizers estimate waste, decide where bins should go, and understand the pedestrian routes people are likely to use.

## The Problem

College events can produce large amounts of waste, but organizers may not know how much waste to expect, how many bins are needed, or where to place them. Poor bin placement and unclear walking routes can make waste collection and event movement harder to manage.

## Our Solution

Bunbetsu brings waste prediction and campus map planning into one workflow. Organizers select a campus, configure event activities and locations, and generate a plan to support practical waste and route decisions.

## Main Features

### 1. Campus & Event Waste Planner

- Find and select a campus to use as the event planning area.
- Add event locations and activity areas directly on the map.
- Enter event details such as expected attendance and duration.
- Mark the entry gate so it can be included in route planning.

### 2. [Waste Prediction Model](backend/models/waste_predictor_model/README.md)

- Estimates the total waste expected from an event using attendance, duration, and activity mix.
- Breaks the estimate into waste categories such as food, plastic, paper, glass, and other waste.
- Uses state-wise baseline data from CPCB where available, with an India-wide average as a fallback.
- Helps organizers plan for waste before the event begins; predictions are estimates, not live measurements.
- Detailed documentation: [Waste Prediction Model README](backend/models/waste_predictor_model/README.md).

### 3. [Bin Distribution Model](backend/models/bin_distribution_model/README.md)

- Converts predicted waste into estimated bin requirements for disposable and recyclable waste.
- Considers the size and shape of each event area when deciding how many bins can fit.
- Places bin markers along suitable boundaries while respecting the spacing policy.
- Helps organizers see where bins could be placed and where physical space may limit placement.
- Detailed documentation: [Bin Distribution Model README](backend/models/bin_distribution_model/README.md).

### 4. Pedestrian Route Builder

- Uses mapped walking paths to build a connected pedestrian network around the campus.
- Connects event locations and the entry gate to nearby walking paths.
- Estimates which paths are likely to be more important based on movement between event locations.
- Shows route priorities on the map to help with event layout and planning; these are modelled estimates, not measured footfall.

### 5. Interactive Planning Map

- Brings campus boundaries, event areas, bin locations, and pedestrian routes together in one view.
- Lets organizers inspect the layout and understand how different parts of the plan relate to one another.
- Displays predicted route demand and planning results visually.
- Helps identify connectivity or space constraints before event day.

### 6. Saved Templates & Event History

- Save an event setup as a template so it can be reused for future events.
- Open saved templates to start planning without rebuilding the setup from scratch.
- Save completed event plans to event history.
- Reopen a saved event snapshot to review the plan as it was saved.

### 7. Accounts & Dashboard

- Sign in with an account to access saved templates and event history.
- Use the dashboard as the starting point for a new event or an existing plan.
- Keep saved planning data associated with the relevant user.
- Guest access is also available for trying the planning workflow.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Maps:** MapLibre GL, Turf.js
- **Backend:** Python, FastAPI
- **Planning & modelling:** NumPy, SciPy, Shapely, PyProj, NetworkX
- **Authentication & database:** Supabase
- **Pedestrian map data:** OpenStreetMap

---

Bunbetsu supports planning and decision-making. Its waste and pedestrian estimates depend on the available data and model assumptions, so they should be treated as planning guidance rather than exact measurements.
