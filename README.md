# 🌌 Quantum Network Lab

A rigorous, browser-based interactive simulation suite for quantum key distribution (QKD), time-bin entanglement, and multi-node entanglement routing. Built entirely without external dependencies to run smoothly in any modern browser.

## 🎯 Overview

The **Quantum Network Lab** translates complex quantum mechanical concepts into a tactile, cyber-physical dashboard. It bridges the gap between abstract physics and intuitive understanding by allowing users to manipulate parameters in real time and observe the statistical and physical outcomes.

### The 4 Interactive Labs:

1. **BB84 QKD:** Simulates the preparation, transmission, and sifting of qubits over a lossy channel. Includes an active intercept-resend eavesdropper model, quantum bit error rate (QBER) estimation, and privacy amplification tracking.
2. **Time-Bin Entanglement:** Models an entangled photon-pair source and Franson interferometry. Users can manipulate phase noise and dark counts to see the direct impact on fringe visibility and the CHSH Bell violation ($S > 2$).
3. **Multi-Node Routing:** A network topology simulator demonstrating entanglement swapping. Models Werner-state fidelity degradation, quantum memory decoherence, Bell-state measurement limits, and entanglement purification across Dijkstra-routed paths.
4. **Telecom Coexistence:** Explores the engineering challenge of running quantum signals alongside classical WDM traffic. Calculates spontaneous Raman scattering noise, direct leakage, and optimal wavelength selection (O-band vs C-band) for shared optical fiber.

## 🛠️ Technical Architecture

This application was designed with a strict zero-dependency philosophy to maximize performance, portability, and longevity.

* **Frontend:** Vanilla HTML5, CSS3, and JavaScript.
* **Styling:** Custom CSS implementing a dark-mode glassmorphism UI, fluid staggered scroll reveals, and a reactive DOM.
* **Rendering:** High-performance, native `<canvas>` elements for dynamic histograms, interferograms, and interactive network routing graphs.
* **Physics Engine:** Custom modular JS engine utilizing Monte Carlo methods and rigorous theoretical approximations (e.g., binary entropy calculations, Werner state models, fiber attenuation).

## 🚀 How to Run

Because this project is entirely self-contained, no build tools, package managers, or server environments are required to run it locally.

1. Clone or download the repository to your local machine.
2. Open `index.html` in any modern web browser.
3. *Optional:* For the best development experience, run via a local server (like VS Code Live Server or `python -m http.server 8000`).

## 👨‍🔬 Author

**Prashant Gupta** MSc Physics, Indian Institute of Technology (IIT) Kharagpur  

*Developed as a portfolio project to demonstrate the practical, interactive intersection of quantum physics, optical engineering, and software architecture.*

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
