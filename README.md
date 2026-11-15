# FrameLab — Interactive Page Replacement Algorithm Simulator

FrameLab is an interactive, educational operating systems workbench designed to simulate, visualize, and compare memory page replacement algorithms: **FIFO** (First-In, First-Out), **LRU** (Least Recently Used), and **Optimal** (MIN / Belady's Optimal).

Built with vanilla HTML5, CSS3, ES modules, and native browser APIs (SVG visualizations and Web Animations API), FrameLab operates without external runtime frameworks or CDN dependencies.

## Key Features

- **Algorithm Engine**: Pure, deterministic implementations of FIFO, LRU, and Optimal algorithms with immutable step-by-step state histories.
- **Interactive Simulator**: Play, pause, forward, rewind, variable speed playback, and a clickable interactive timeline.
- **Memory Frame Visualization**: Real-time physical memory slot updates, eviction callouts, target frame highlights, hit/fault badges, and evicted-to-disk tracking.
- **Step-by-Step Educational Explanations**: Contextual narrative for every page reference detailing why a hit or fault occurred and the rationale behind eviction choices.
- **Live Algorithm Comparison**: Simultaneous metrics evaluation (faults, hits, fault ratio, hit ratio, replacements) accompanied by SVG bar charts and fault accumulation trajectories.
- **Deep Learning Module**: Theory, trade-offs, real-world OS constraints, time/space complexity, and an exploration of Belady's Anomaly.
- **Premium Responsive UI/UX**: Swiss-minimalist typography, accessible contrast, visible focus rings, and full `prefers-reduced-motion` compliance.

## Project Structure

```
FrameLab/
├── index.html            # Main application shell loading ES modules
├── package.json          # Node.js project manifest with native test scripts
├── README.md             # Documentation and usage guide
├── .gitignore            # Git exclusion rules
│
├── reference/
│   └── FrameLab-original.html  # Original preserved baseline implementation
│
├── css/
│   ├── tokens.css        # Design tokens, color system, and typography scales
│   ├── base.css          # Reset, global element styles, and accessibility utilities
│   ├── layout.css        # Application grid, header, nav, and container layouts
│   ├── components.css    # Reusable UI elements (buttons, inputs, cards, badges)
│   ├── simulator.css     # Memory slots, stage layout, timeline, and controls
│   ├── comparison.css    # Metrics tables, comparison cards, and SVG charts
│   ├── learning.css      # Educational cards, complexity matrices, and anomaly demo
│   ├── animations.css    # Keyframes, transitions, and reduced-motion overrides
│   └── responsive.css    # Breakpoint adaptations (375px to 1440px+)
│
├── js/
│   ├── algorithms.js     # Pure engine for FIFO, LRU, and Optimal algorithms
│   ├── validation.js     # Strict validation and parsing for reference sequences
│   ├── simulator.js      # Simulation controller, playback timer, and frame renderer
│   ├── comparison.js     # Multi-algorithm benchmark runner and chart renderer
│   ├── learning.js       # Educational module interaction and Belady's anomaly tool
│   └── main.js           # Application entrypoint, routing, and event delegation
│
└── tests/
    ├── algorithms.test.js  # Verification of FIFO, LRU, and Optimal algorithms
    ├── validation.test.js  # Unit tests for input parsing, bounds, and error handling
    └── metrics.test.js     # Invariant checks, ratios, and cumulative step analytics
```

## Quick Start

### Running Tests
Execute the comprehensive Node.js built-in test suite:
```bash
npm test
```

### Running the Application
Launch with any local static HTTP server (e.g. VS Code Live Server, Python, or Node):
```bash
# Using Python
python -m http.server 3000

# Or using Node
npx serve -l 3000 .
```
Open `http://localhost:3000` in your web browser.
