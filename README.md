# ATLAS — Explore a História (Fase 1)

Protótipo funcional: globo interativo, linha do tempo, busca, filtros, painel de detalhes e uma base inicial de 14 acontecimentos.

## Executar
```bash
cd atlas
npm start            # ou: python3 -m http.server 8080
# abrir http://localhost:8080
npm test             # testes da lógica (Node ≥ 20, sem dependências)
```
Não há etapa de build nem `npm install`. **Precisa de internet no navegador** para carregar duas dependências de CDN (jsDelivr):
- `three@0.160.0` (MIT) → globo 3D. Se falhar ou não houver WebGL, o app usa o globo 2D de reserva.
- `world-atlas@2 / land-110m` (Natural Earth, domínio público) → contornos dos continentes. Se falhar, o globo mostra só graticule e marcadores, com aviso na tela.
Nenhum serviço pago é usado. `?render=2d` na URL força o globo 2D.

## O que está implementado
Globo 3D (Three.js) e 2D de reserva, arrastar/zoom/recentrar/girar/pausar rotação, teclado (setas, +, −, 0 com o palco focado), marcadores selecionáveis, voo suave até o evento; barra de tempo com escala não linear, períodos históricos, reprodução; busca real (sem acento, múltiplos termos); filtros por categoria, região e período; painel de detalhes (síntese → “Ler mais”, relacionados, precisão, fontes); módulos **Explorar**, **Linha do Tempo** e **Arquivo**; favoritos (localStorage), exploração aleatória, link compartilhável (filtros + seleção, sem dados pessoais); layout responsivo; lista como alternativa ao globo.

## O que NÃO está implementado (botões desabilitados ou ausentes)
Conflitos, Civilizações, Laboratório (Fases 2–3); fronteiras históricas e mudanças territoriais (não há série documentada — nada é inventado); grafo de conexões; Sala de Aula; coleções, diário, modo apresentação, comparador, relatórios; autenticação e backend; pesquisa avançada; agrupamento de marcadores (com 14 eventos não é necessário).

## Limitações honestas
- **Não foi testado em navegador com acesso à internet**: o ambiente de construção não tinha rede. O caminho 3D (Three.js + textura de continentes) foi escrito mas **não executado**; testei o globo 2D, a lógica e a interface com Chrome (Playwright). A orientação da textura foi derivada por cálculo e precisa de conferência visual (ex.: Brasil e Europa nos lugares certos).
- Stack: JavaScript puro com módulos ES em vez de React/TS/Vite/Tailwind, porque instalações de pacotes estavam bloqueadas. A estrutura (dados, lógica pura, globo com interface comum) migra para React Three Fiber sem reescrever dados e lógica.
- **Conteúdo**: sínteses redigidas para a demonstração; **as URLs das referências não foram verificadas online** e todos os itens estão com curadoria “rascunho”. Revisar antes de publicar. Coordenadas são de cidades/locais representativos; o campo `precision` e `precisionNote` indicam quando o ponto é simbólico (ex.: Apollo 11 marca o lançamento, não o pouso).
- Base pequena (14 itens, só Europa/Ásia/África/Américas em recortes amplos): não representa a história global de forma equilibrada. Ampliar é prioridade da Fase 2.

## Estrutura
`src/data/events.js` (dados estruturados) · `src/lib/logic.js` (busca, filtros, escala, URL) · `src/lib/geo.js` (TopoJSON, projeção) · `src/globe/globe3d.js`, `globe2d.js` · `src/main.js` (UI) · `tests/`.
