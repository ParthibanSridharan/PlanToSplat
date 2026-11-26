# PlanToSplat
Browser-First 3D Real Estate Reconstruction &amp; Interactive Virtual Staging  Transform standard 2D property photos into walkable, photorealistic 3D environments rendered locally via WebGPU.
# 🏡 PlanToSplat AI

> **Browser-First 3D Real Estate Reconstruction & Interactive Virtual Staging**  
> *Transform standard 2D property photos into walkable, photorealistic 3D environments rendered locally via WebGPU.*

[![Next.js](https://img.shields.io/badge/Next.js-15.0-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r170-black?style=flat-square&logo=three.js)](https://threejs.org/)
[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-blueviolet?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## 🌟 Key Features

* ⚡ **Client-Side WebGPU Processing:** Render photorealistic 3D Gaussian Splats (`.splat`, `.ply`) directly in the user's web browser without server-side WebGL GPU costs.
* 📸 **Intelligent Photo Ingestion:** Client-side OpenCV pre-validation automatically checks image overlap, rejects blurred captures, and parses EXIF metadata for rapid camera parameter estimation.
* 🛋️ **AI Virtual Staging:** Raycast anywhere in a reconstructed 3D interior room to dynamically place, rotate, and scale open-source 3D furniture models (`.gltf` / `.glb`).
* 📐 **Spatial Raycasting Measurement:** Built-in 3D tape measure allowing users to click two points on surface geometry to calculate real-world distances in meters or feet.
* 🗺️ **Interactive Navigation & Mini-Map:** Seamless switching between **First-Person WASD Walkthrough** and **Aerial Orbit Mode**, accompanied by a live orthographic floorplan radar.
* 🏞️ **Land Plot Topography Extractor:** Special exterior pipeline designed to construct 3D terrain meshes for empty land plots and overlay customizable wireframe house designs.

---

## 🏗️ System Architecture
