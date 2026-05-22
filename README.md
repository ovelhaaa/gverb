# gverb

Biblioteca C do algoritmo de reverberação **gverb**.

## Demo WebAssembly (WASM)

Este repositório inclui um exemplo web completo em `web/` com:

- upload de áudio (`.wav`, `.mp3`, `.ogg`, etc.);
- processamento em **tempo real** com `AudioWorklet` + WASM;
- controles de transporte (play, pause, stop, seek, loop, volume, velocidade);
- ajuste dos parâmetros principais do gverb;
- exportação do áudio processado para arquivo WAV.

### Pré-requisitos

- [Emscripten](https://emscripten.org/) (`emcc`) no `PATH`.
- Navegador moderno com suporte a `AudioWorklet`.

### Build do WASM

```bash
./web/build_wasm.sh
```

Isso gera:

- `web/public/gverb_wasm.js`
- `web/public/gverb_wasm.wasm`

### Servir o demo localmente

Use qualquer servidor HTTP estático na pasta `web/public`.
Exemplo com Python:

```bash
cd web/public
python3 -m http.server 8080
```

Acesse: <http://localhost:8080>
