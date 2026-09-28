# Louvores - Progressive Web App (PWA)

Aplicativo web progressivo (PWA) para gestão e organização de repertório de louvores musicais, escalas de Terça e Domingo, cálculo de frequência de uso, reordenação arrastável (drag & drop) e compartilhamento rápido pelo WhatsApp.

## 📁 Estrutura Simplificada

O projeto foi simplificado para funcionar sem etapas complexas de compilação ou dependências pesadas, mantendo apenas os seguintes arquivos essenciais para máxima facilidade de manutenção:

- **`index.html`**: Estrutura HTML5 semântica, ícones SVG embutidos para funcionamento 100% offline, tags PWA e modais.
- **`style.css`**: Design system completo com temas Claro (Gmail-like) e Escuro (Black & Blue), responsividade e animações.
- **`script.js`**: Lógica da aplicação, integração com Supabase, sincronização de cache local (`localStorage`), ordenação arrastável desktop/mobile e prompt de instalação PWA.
- **`sw.js`**: Service Worker para cache inteligente de ativos e suporte offline completo.
- **`manifest.json`**: Manifesto PWA para instalação no Android, iOS, Windows e Mac.
- **`icone.png`**: Ícone oficial do aplicativo de alta resolução.
- **`README.md`**: Documentação do projeto.

## ✨ Recursos

- ⚡ **Zero-Build**: Não necessita de Vite, Webpack ou build. Edite diretamente e visualize no navegador.
- 📱 **Instalável (PWA)**: Funciona como app nativo com tela cheia, ícone na tela inicial e instruções guiadas para iOS/Android.
- 📴 **100% Offline**: Cache automático de interface pelo Service Worker e persistência local de louvores.
- 🔄 **Sincronização em Nuvem**: Conexão com banco de dados Supabase para sincronização em tempo real.
- 🎵 **Repertório Musical**: Cadastro de título, artista, tonalidade, links de cifras, letras e vídeos no YouTube.
- 📅 **Escalas & Histórico**: Organização de escalas por Terça e Domingo com seletor de data e histórico categorizado.
- ✋ **Arrastar para Reordenar**: Drag & Drop fluido tanto em computadores quanto em celulares (touch).
- 💬 **Compartilhamento WhatsApp**: Envio formatado de escalas e repertório com um clique.
- 🌓 **Tema Claro & Escuro**: Alternância dinâmica de cores respeitando preferências do usuário.

## 🚀 Como Executar Localmente

Você pode abrir o projeto usando qualquer servidor web estático:

```bash
# Opção 1: Usando npx serve
npx serve .

# Opção 2: Usando Python
python -m http.server 3000

# Opção 3: Usando extensão Live Server no VS Code
# Basta clicar com o botão direito no index.html e selecionar "Open with Live Server"
```
