# Componentes de terceiros

## MediaPipe Tasks Vision 0.10.21

- Autor: Google LLC.
- Projeto: https://github.com/google-ai-edge/mediapipe
- Pacote original: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.21.tgz
- Licença: Apache License, Version 2.0; texto incluído em `vendor/LICENSE`.
- Arquivos redistribuídos sem alteração: `vendor/vision_bundle.mjs`, `vendor/wasm/vision_wasm_internal.js`, `vendor/wasm/vision_wasm_internal.wasm`, `vendor/wasm/vision_wasm_nosimd_internal.js`, `vendor/wasm/vision_wasm_nosimd_internal.wasm`.

## Hand Landmarker

- Autor: Google.
- Modelo: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- Documentação oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
- Arquivo redistribuído sem alteração em `assets/hand_landmarker.task`.

Os arquivos foram incluídos para permitir operação local e reduzir dependências de rede durante o evento. A interface, lógica da missão e desenhos vetoriais do jogo foram criados especificamente para corpoMove.
