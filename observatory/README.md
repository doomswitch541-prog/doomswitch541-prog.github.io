# Observatory

A local-first 3D common room at `/observatory/`, linked from Visuals. Vanilla browser modules use the existing vendored Three.js r128 and OrbitControls; no build step or backend.

Drag objects across their supporting surfaces; drag empty space to orbit. The Objects panel provides keyboard-accessible placement and rotation controls. Click the lamp to toggle its light. Notes attach to objects or to the wall; wall markers can be dragged. Notes remain plain text.

Object placement, light, notes, and the camera persist under `rghq:observatory:v1` in this browser's localStorage. Export/import copies the versioned arrangement as JSON. Import is validated before replacement, and storage failures retain edits in memory with an export notice. This version has no multiplayer connection or remote storage.

`state.js` owns stable IDs, room-coordinate placement, validation, and the `read/update/subscribe` adapter. Rendering and interaction live separately in `scene.js` and `room.js`. A future synchronization adapter can share room state while keeping each visitor's camera local. It should use a separate development room and explicit host configuration; no synchronization service is enabled here.

The architecture borrows RGHQ's theme and navigation and the material ideas in its design-language catalog: structural metal, glass depth, and a contained ink vessel. Materials explicitly convert sRGB colors for the existing Three revision. Ambient pigment motion stops under reduced-motion preferences; rendering suspends while hidden. Object and note controls remain available if WebGL fails.

Focused verification: disposable Firefox checks for actual pointer dragging, object controls, notes, reload persistence, lamp state, and export/import; desktop and narrow-window visual inspection. These are desktop browser checks, not physical-phone verification.
