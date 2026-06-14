"use strict";

// Pure numerical helpers shared by every simulation.
// This file intentionally has no DOM access, canvas rendering, or UI state.
window.QNLCore = Object.freeze({
  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  },

  binaryEntropy(probability) {
    const p = Math.max(1e-12, Math.min(1 - 1e-12, probability));
    return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
  },

  fiberTransmission(lengthKm, attenuationDbPerKm) {
    return Math.pow(10, -(attenuationDbPerKm * lengthKm) / 10);
  },

  secretFraction(qber) {
    return Math.max(0, 1 - 2 * this.binaryEntropy(qber));
  },

  seededRNG(seed) {
    let state = seed >>> 0;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  },

  stringSeed(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  },

  wernerSwap(fidelityA, fidelityB) {
    return fidelityA * fidelityB
      + ((1 - fidelityA) * (1 - fidelityB)) / 3;
  },

  memoryDecay(fidelity, elapsedMs, lifetimeMs) {
    const lifetime = Math.max(1e-9, lifetimeMs);
    return 0.25 + (fidelity - 0.25) * Math.exp(-elapsedMs / lifetime);
  }
});
