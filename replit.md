# BashaLanka — Sinhala Learning App

## Overview
BashaLanka is a language learning application focused on teaching Sinhala (the primary language of Sri Lanka). The app uses a game-like, interactive approach similar to Duolingo, with various exercise types including matching pairs, translation, listening comprehension, and speaking practice.

## Project Type
Static HTML/CSS/JavaScript web application (no backend required)
- Framework-free, accessible, and mobile-first design
- Progressive Web App (PWA) capabilities with service worker
- Hash-based client-side routing

## Recent Changes (2025-10-27)
- **Section Navigation Enhancement**: Implemented proper section deep-linking with race condition fix
  - Added hash routing support for #/section/{id} URLs
  - Implemented waitForLearnModule helper to ensure Learn module initialization before rendering
  - Section view now displays full vertical lesson path (not accordion expansion)
  - "Start Section" buttons properly navigate to section view
  - Back button returns to main Learn overview
  
- **Characters Page Redesign**: Complete visual and functional overhaul
  - Added progress header showing Mastered/Learning/New character stats
  - Implemented filter tabs (All, Vowels, Consonants, Combined Forms)
  - Enhanced card layout with hover animations and cleaner design
  - Progress tracking based on localStorage mastery data
  
- **Home Page Visual Improvements**: Enhanced landing experience
  - Multi-layer gradient background with radial overlays
  - Animated floating logo with glow effect
  - Gradient text styling for main title
  - Fade-in animations for all elements with staggered delays
  - CTA buttons with ripple hover effects
  - Glass-morphism effect on feature cards
  
- **Bug Fixes**:
  - Fixed PictureChoice exercise module duplicate 'choices' key in buildLayout return
  
- **GitHub Import Completed**: Successfully set up BashaLanka in Replit environment
  - Installed npm dependencies (http-server)
  - Created .gitignore for Node.js and Replit files
  - Configured workflow to run on port 5000
  - Set up deployment configuration for autoscale (static site)
  - Verified app runs correctly with all features working

## Previous Changes (2025-10-27)
- **Lesson Access**: All users can now start lessons (previously admin-only)
- **Characters View**: New view with Sinhala character grid, audio playback, and practice
- **Practice Builder**: Custom practice session configurator with mode/exercise/duration selection
- **Quests System**: Daily and weekly challenges with progress tracking and rewards
- **Landing Page**: Dedicated home view for new users with hero section and feature cards
- Fixed routing to properly handle home view
- Removed undefined connectLessons() call that was causing console errors

## Initial Setup (2025-10-26)
- Initial GitHub import to Replit
- Set up Node.js development environment
- Configured http-server for local development on port 5000
- Added .gitignore for Node.js and Replit files
- Created workflow for automatic server startup

## Project Architecture

### Technology Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Routing**: Hash-based client-side routing
- **PWA**: Service Worker (sw.js) with manifest
- **Server**: http-server (development) - static file serving only
- **Module Loading**: Dynamic ES6 imports for exercise modules

### Directory Structure
```
/
├── index.html              # Main app shell
├── app.js                  # Core app logic, routing, UI controls
├── app.learn.js            # Learning section functionality
├── app.characters.js       # Characters view with Sinhala alphabet
├── app.practice.js         # Custom practice session builder
├── app.quests.js           # Daily/weekly quest system
├── app.home.js             # Landing page for new users
├── design-mode.js          # Debug tools (admin only)
├── styles.css              # Base styles and CSS tokens
├── styles.learn.css        # Styles for learning view
├── styles.features.css     # Styles for new feature views
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service worker
├── assets/
│   ├── Lessons/            # Lesson content and exercises
│   │   ├── exercises/      # Exercise type modules (JS)
│   │   └── sections/       # Course content (Markdown)
│   ├── Sinhala_Audio/      # Audio files for pronunciation
│   ├── PNG/                # Image assets
│   ├── SVG/                # Vector graphics
│   └── data/
│       └── characters.json # Character data for Characters view
└── data/                   # JSON data files for lessons/sections
```

### Key Features
1. **Multiple Exercise Types**:
   - Match Pairs
   - Translation (English ↔ Sinhala)
   - Picture Choice
   - Fill in the Blank
   - Listening Comprehension
   - Speaking Practice
   - Word Bank exercises
   - Dialogue practice

2. **Learning Path**:
   - Organized into Sections → Units → Lessons
   - All users can start lessons via "Start Lesson!!" button
   - Progress tracking via localStorage
   - Lesson simulator for testing
   - Debug tools for admins

3. **Characters Study**:
   - Grid-based character cards (vowels, consonants, common words)
   - Audio pronunciation for each character
   - Progress tracking per character
   - Practice launcher for individual characters

4. **Custom Practice Sessions**:
   - Multiple practice modes (recent mistakes, weakest skills, random, specific lesson)
   - Exercise type selection
   - Configurable session duration
   - Integrates with existing LessonSimulator

5. **Quest System**:
   - Daily quests (reset at midnight)
   - Weekly quests (reset on Sundays)
   - Progress visualization with bars
   - Reward display (XP, streaks, badges)
   - LocalStorage-based tracking

6. **Landing Page**:
   - Hero section with app branding
   - Call-to-action buttons
   - Feature showcase cards
   - Auto-redirects returning users to Learn view

7. **Accessibility**:
   - Semantic HTML
   - ARIA labels and roles
   - Keyboard navigation
   - Focus management for modals/drawers

8. **Responsive Design**:
   - Mobile-first approach
   - Sidebar drawer for navigation
   - Theme toggle (light/dark/system)

### Data Flow
- Course structure defined in `assets/Lessons/course.map.json`
- Lesson content stored in Markdown files
- Exercise data in JSON files under `/data/`
- User progress stored in localStorage
- Audio files served statically from `assets/Sinhala_Audio/`

## Development Setup

### Running Locally
The app is configured to run on port 5000 using http-server:
```bash
npm run dev
```

This starts the server on `0.0.0.0:5000` with:
- CORS enabled for development
- Cache disabled (`-c-1`) for instant updates
- Accessible from Replit webview

### Environment
- **Host**: 0.0.0.0 (required for Replit proxy)
- **Port**: 5000 (only port exposed in Replit)
- **Base Path**: Auto-detected based on hosting environment
  - Localhost/Replit: `./`
  - GitHub Pages: `/BashaLanka/`

### Configuration
The app automatically detects its environment and adjusts asset paths:
- Uses `REPO_BASE_PATH` variable for path resolution
- Supports both relative (`./`) and absolute (`/`) paths
- Works on localhost, Replit, and GitHub Pages deployments

## Deployment
The project is ready for deployment as a static site. Suitable platforms:
- Replit (current)
- GitHub Pages
- Netlify
- Vercel
- Any static hosting service

## User Preferences
None specified yet - this is the initial setup.

## Notes
- No backend required - all data is client-side
- Login is mock (localStorage only) with "admin" username for debug access
- Service worker currently has no caching strategy implemented
- All audio files are pre-recorded MP3s (fast/slowed versions)
