# corpoMove — Você no comando

Jogo para a Feira das Profissões: uma webcam acompanha a mão do visitante, que pilota uma nave e dispara fazendo uma pinça entre polegar e indicador. Partidas de 60, 90 ou 120 segundos, três vidas, esquadrões inimigos, nave-mãe, combos, melhorias de arma, escudo, reparos e efeitos sonoros e ranking por duração/dificuldade.

## Publicar no GitHub Pages

Os arquivos do jogo estão na raiz do repositório `Marcelo-Preigschadt/corpoMove`.

1. Entre em **Settings → Pages → Build and deployment**.
2. Em **Source**, selecione **Deploy from a branch**.
3. Selecione **main** e a pasta **/ (root)**. Clique em **Save**.
4. Aguarde a publicação e abra `https://marcelo-preigschadt.github.io/corpoMove/`.
5. Clique em **Ativar webcam**, permita a câmera e use **Tela cheia**.

Não precisa de Node, npm, framework, chave de API, banco de dados ou backend para publicar. `package.json` e `tests` servem apenas para verificar a lógica durante desenvolvimento.

## Preparar webcam e datashow

1. Conecte a webcam USB e o datashow ao computador.
2. Coloque a webcam perto da projeção, apontada para o visitante, evitando que a luz do projetor incida diretamente na lente.
3. Abra o endereço HTTPS publicado em **Chrome ou Edge**. Não abra `index.html` por duplo clique: módulos, modelo e webcam exigem servidor.
4. Clique em **Ativar webcam** e permita o acesso à câmera.
5. Em **Ajustes**, selecione a webcam USB e clique em **Aplicar câmera** se houver outra câmera no computador. Feche os ajustes.
6. Clique em **Tela cheia** ou use F11 no navegador. Para projetar o jogo e manter o controle no mesmo computador, use a opção de duplicar as telas no sistema operacional.
7. Mostre **uma mão** à câmera. O quadro mostra os pontos rastreados. Uma mão aberta por 2 segundos inicia a contagem regressiva; o botão **Iniciar missão** também inicia quando há uma mão detectada.
8. A posição inicial da mão vira o centro do controle. A área necessária é aproximadamente um terço da imagem: não é preciso chegar perto das bordas da webcam. O retângulo tracejado mostra a área de controle. Mova a mão para os lados e para cima/baixo. A palma controla a nave. Una polegar e indicador para disparar; mantendo a pinça, os disparos se repetem.
9. Se estiver difícil alcançar as bordas, use **Ajustes → Calibrar área de movimento**, a partir da tela inicial. Mantenha a mão no limite confortável superior esquerdo por 1 segundo; depois, no inferior direito. A posição precisa permanecer estável. A calibração vale até recarregar a página.
10. Para crianças menores ou visitantes com dificuldade no gesto, escolha **Disparo automático** nos ajustes.

A distância depende da webcam: comece com aproximadamente 1 metro e ajuste até a mão aparecer inteira no quadro. Ilumine pela frente e mantenha a mão afastada de outras pessoas. Se a mão desaparecer por mais de 0,6 segundo, a missão pausa; depois de recuperar o rastreamento, há nova contagem regressiva. Tempo e pontuação ficam congelados enquanto a missão está pausada.

## Missão e melhorias

- Primeiro quarto do tempo: asteroides e pequenos esquadrões.
- Segundo setor: formações com interceptadores e naves que disparam contra o jogador.
- Ao atingir 62% do tempo: chegada da nave-mãe, com barra de energia, movimento lateral, disparos em leque e ataques direcionados.
- A destruição da nave-mãe encerra a missão com vitória. O tempo máximo e as três vidas continuam limitando o voo.
- **W**: melhora a arma para laser triplo e depois quíntuplo, por 12 segundos.
- **S**: escudo por 12 segundos, que absorve um impacto.
- **+**: recupera uma vida, até o máximo de três.
- **◆**: cristal de pontos.
- Destruições consecutivas em até 3,5 segundos mantêm o combo. A cada quatro, o multiplicador aumenta, até ×5. Perder uma vida interrompe o combo.

## Pontuação

- Meteoro destruído: **100 pontos**. Meteoros grandes precisam de dois impactos.
- Interceptador: **200 pontos**; nave armada: **350 pontos**.
- Nave-mãe: **2.500 pontos**.
- Destruições recebem o multiplicador de combo atual.
- Meteoro que passa sem atingir a nave: **10 pontos**.
- Cristal verde coletado: **150 pontos**.
- Colisão: perde uma vida e recebe 1,5 segundo de proteção.
- A partida termina ao acabar o tempo ou as três vidas.

Esta edição usa um ranking novo, pois a pontuação mudou; os dados da primeira edição não são apagados. O ranking pertence ao navegador deste computador, usa `localStorage` e separa duração/dificuldade. Não é compartilhado entre máquinas. O modo com mouse não entra no ranking da webcam. Pinça e disparo automático usam o mesmo ranking: para uma disputa comparável, mantenha o mesmo modo de disparo durante o evento. Se o armazenamento estiver bloqueado, o jogo informa que o ranking ficará somente na sessão.

## Operação da feira

- **F:** alternar tela cheia, quando o foco não estiver num botão/campo.
- **P:** pausar/continuar.
- **Enter:** iniciar na tela inicial, com webcam pronta e mão detectada.
- **Escape:** pausar. O navegador pode usar Escape primeiro para sair da tela cheia.
- **Testar com mouse:** mover o mouse para pilotar; segurar clique ou espaço para disparar. Sem webcam e fora do ranking oficial.
- **Som:** habilitação por botão; começa desligado.
- Ao fim, informe um apelido e clique em **Salvar**. **Próximo piloto** retorna ao início. Após 30 segundos sem edição do apelido, retorna automaticamente.
- **Ajustes → Desligar webcam:** encerra captura e reconhecimento.
- **Ajustes → Apagar ranking:** requer confirmação e remove somente o ranking do jogo.

Abrir Ajustes, trocar de aba ou tirar o foco da janela pausa a missão. Fechar Ajustes não retoma o voo sozinho: use **Continuar**.

## Rodar localmente

Com Python instalado, abra um terminal na pasta que contém `index.html`:

```sh
python -m http.server 8000
```

Abra `http://localhost:8000` no navegador. `localhost` permite acesso à webcam. Todos os arquivos do reconhecimento estão incluídos, portanto o servidor local funciona sem internet depois de extrair o projeto. A publicação no GitHub Pages precisa de conexão para carregar os arquivos; não há cache offline automático.

## Organização

```text
index.html               interface
style.css                layout para projeção e telas menores
app.js                   estados, webcam, desenho, áudio e ranking
mechanics.js             rastreamento convertido em controle e lógica do jogo
tracker-worker.js        inferência em Web Worker
assets/icon.svg          ícone
assets/hand_landmarker.task   modelo de mãos
vendor/vision_bundle.mjs      MediaPipe Tasks Vision 0.10.21
vendor/wasm/                 runtime WebAssembly com e sem SIMD
tests/mechanics.test.js       verificações da lógica
package.json                 comando de teste, sem dependências
.nojekyll                    evita processamento Jekyll
```

O navegador processa os quadros localmente em um Web Worker, sem transmitir vídeo para servidor. Apenas uma inferência fica em andamento; o envio é limitado a aproximadamente 30 quadros por segundo para preservar a renderização. O desempenho real depende da máquina e da webcam. A posição usa média dos pontos da palma, mapeamento espelhado, centralização automática e filtragem adaptativa com suavização mais rápida da nave. A pinça usa distância proporcional à largura da palma, correção de proporção da imagem e histerese.

## Desenvolvimento e testes

```sh
npm test
```

Ou `node --test tests/*.test.js`. Verifica mapeamento, pinça, histerese, destruição de meteoros, pontuação, colisão, invulnerabilidade e fim da missão. O teste não substitui a validação com a webcam física no laboratório.

## Componentes de terceiros

MediaPipe Tasks Vision **0.10.21**, Google, Apache-2.0. Modelo Hand Landmarker disponibilizado pelo Google. Consulte `THIRD_PARTY_NOTICES.md` e `vendor/LICENSE`.
