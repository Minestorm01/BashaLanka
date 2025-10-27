# BashaLanka — Sinhala Learning App

## Overview
BashaLanka is a language learning application designed to teach Sinhala using an interactive, game-like approach similar to Duolingo. It features various exercise types, including matching, translation, listening, and speaking practice. The project aims to provide an accessible, mobile-first, and progressive web application (PWA) experience, making Sinhala learning engaging and effective. The application is a static HTML/CSS/JavaScript web application requiring no backend.

## User Preferences
None specified yet - this is the initial setup.

## Recent Changes

### Exercise System Fix (2025-10-27)
Fixed 5 non-working exercise types to dynamically pull vocabulary from each lesson:
- **FillBlank**: Auto-generates from current lesson vocab (no external assets required)
- **PictureChoice**: Auto-generates from current lesson vocab with dynamic image paths
- **Listening**: Auto-generates from current lesson vocab with dynamic audio paths
- **Speaking**: Auto-generates from current lesson vocab (random word selection)
- **Dialogue**: Uses static config.json (too complex for auto-generation)
- All exercises now show different words from the selected lesson, just like Translate exercises
- Config.json files serve as fallbacks when vocab fetch fails

## System Architecture

### UI/UX Decisions
- **Mobile-first design**: Ensures responsiveness across devices.
- **PWA capabilities**: Includes a service worker and manifest for installability and offline access.
- **Hash-based client-side routing**: Manages navigation without server-side requests.
- **Duolingo-style UI**: Gamified learning experience with mastery systems, interactive character learning, and visual progress tracking.
- **Theming**: Supports dynamic color transitions (new → learning → mastered) and visual mastery effects with pulse animations.
- **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation, and focus management.
- **Home Page**: Features a multi-layer gradient background, animated logo, gradient text, fade-in animations, CTA buttons with ripple effects, and glass-morphism feature cards.

### Technical Implementations
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Dynamic Module Loading**: ES6 imports for exercise modules.
- **Exercise System**: Supports various exercise types (Match Pairs, Translation, Picture Choice, Fill in the Blank, Listening, Speaking, Word Bank, Dialogue). Exercises can auto-generate configurations from lesson vocabulary or load from static JSON files.
- **Tracing Validation System**: Replaced algorithmic validation with a pixel-perfect overlay comparison, utilizing a dual-canvas architecture, three-zone tolerance system, and specific validation thresholds for character tracing.
- **Mastery System**: Implements a strength-based progression (0-100 points) requiring multiple successes for mastery, with strength gain/loss for correct/incorrect answers and streak tracking.
- **Interactive Character Learning System**: Transforms the Characters page into a gamified hub with interactive modals for detailed information, tracing practice with stroke validation, and mini-exercises.
- **Progress Tracking**: Detailed localStorage stats for mastery, strength, attempts, streaks, and practice activities for both lessons and individual characters.
- **Section Navigation**: Implements hash routing for deep-linking and a `waitForLearnModule` helper for proper initialization.

### Feature Specifications
- **Learning Path**: Organized into Sections → Units → Lessons with progress tracking via localStorage.
- **Characters Study**: Grid-based character cards with audio pronunciation, individual character progress tracking, and practice launchers.
- **Custom Practice Sessions**: Configurable practice modes (recent mistakes, weakest skills, random, specific lesson), exercise types, and session duration.
- **Quest System**: Daily and weekly challenges with progress visualization and reward tracking via localStorage.
- **Landing Page**: Dedicated home view for new users with hero section, feature cards, and automatic redirection for returning users.
- **Development Setup**: Configured with `http-server` for local development on port 5000, supporting CORS and cache disabling. Auto-detects environment for asset path resolution (localhost, Replit, GitHub Pages).

### System Design Choices
- **Client-Side Data**: All application data, including user progress and content, is managed client-side using localStorage.
- **Static Site Deployment**: Designed for deployment on static hosting services (Replit, GitHub Pages, Netlify, Vercel).
- **No Backend**: The application functions entirely without a server-side component, simplifying deployment and scaling.
- **Modularity**: Codebase is structured into distinct JavaScript files for core logic, specific views (learn, characters, practice, quests, home), and styling.

## External Dependencies
- **http-server**: Used for local development and serving static files.
- **Web Audio API**: For audio playback in lessons and character pronunciation.
- **localStorage**: For storing user progress, settings, and other client-side data.