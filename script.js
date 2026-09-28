/**
 * Louvores - PWA Standalone
 * Gestão de repertório musical com sincronização Supabase e suporte offline completo
 */

(function () {
  'use strict';

  // Define as credenciais padrão e inicializa a conexão com o Supabase.
  const SUPABASE_URL_PADRAO = "https://atxlxznysjrwacmgnhrm.supabase.co";
  const SUPABASE_ANON_KEY_PADRAO = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0eGx4em55c2pyd2FjbWduaHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMTIxMDksImV4cCI6MjA4MDc4ODEwOX0.6_zENptIdtvOBBj7_aEX_kuduTtP7dTdyF2XvcXEB4A";

  function obterConfigSupabase() {
    const urlSalva = localStorage.getItem('supabase_url');
    const keySalva = localStorage.getItem('supabase_anon_key');
    return {
      url: (urlSalva && urlSalva.trim()) ? urlSalva.trim() : SUPABASE_URL_PADRAO,
      key: (keySalva && keySalva.trim()) ? keySalva.trim() : SUPABASE_ANON_KEY_PADRAO
    };
  }

  let supabaseClient = null;

  function inicializarSupabase() {
    const config = obterConfigSupabase();
    if (window.supabase && typeof window.supabase.createClient === 'function' && config.url && config.key) {
      try {
        supabaseClient = window.supabase.createClient(config.url, config.key);
      } catch (e) {
        console.warn("Erro ao instanciar cliente Supabase:", e);
        supabaseClient = null;
      }
    }
  }
  inicializarSupabase();

  // Reúne os dados e controles usados pela interface.
  const estado = {
    repertorio: lerCache('louvores_cache_repertorio') || [],
    terca: lerCache('louvores_cache_terca') || [],
    domingo: lerCache('louvores_cache_domingo') || [],
    historicoTerca: lerCache('louvores_cache_hist_terca') || [],
    historicoDomingo: lerCache('louvores_cache_hist_domingo') || [],
    abaAtiva: localStorage.getItem('activeTab') || 'repertorio',
    mostrarHistorico: false,
    termoPesquisa: '',
    ordenarPorUso: false,
    carregando: false,
    statusSupabase: 'checking',
    mensagemSupabase: 'Verificando conexão...',
    sessao: null,
    louvorParaEnvio: null,
    louvorEditando: null,
    confirmacaoAcao: null,
    deferredPrompt: null
  };

  // Lê e grava os dados locais usados para manter o aplicativo disponível offline.
  function lerCache(chave) {
    try {
      const salvo = localStorage.getItem(chave);
      return salvo ? JSON.parse(salvo) : null;
    } catch {
      return null;
    }
  }

  function salvarCache(chave, dados) {
    try {
      localStorage.setItem(chave, JSON.stringify(dados));
    } catch {}
  }

  // Obter a próxima data de exibição; datas passadas ficam apenas no histórico.
  function obterDataExibicao(lista) {
    if (!lista || lista.length === 0) return null;
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");
    const dia = String(agora.getDate()).padStart(2, "0");
    const hoje = `${ano}-${mes}-${dia}`;

    const datas = Array.from(new Set(lista.map(l => l.data).filter(Boolean)));
    const datasFuturas = datas.filter(d => d >= hoje).sort();
    return datasFuturas[0] || null;
  }

  // Formatação de data em pt-BR
  function formatarData(dataStr) {
    if (!dataStr || dataStr === 'sem-data') return 'Sem data definida';
    const partes = dataStr.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataStr;
  }

  // Normalização para pesquisa sem acentos
  function normalizarTexto(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  // Cria mensagens temporárias de retorno para as ações do usuário.
  function mostrarToast(titulo, descricao = '', tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `
      <div>
        <div class="toast-title">${titulo}</div>
        ${descricao ? `<div class="toast-desc">${descricao}</div>` : ''}
      </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Atualiza o indicador e os detalhes visuais da conexão com o Supabase.
  function atualizarStatusSupabase(status, mensagem = '') {
    estado.statusSupabase = status;
    if (mensagem) estado.mensagemSupabase = mensagem;

    const dotHeader = document.getElementById('indicador-status-supabase');
    const textoHeader = document.getElementById('texto-status-supabase');
    if (dotHeader) dotHeader.className = `status-dot ${status}`;
    if (textoHeader) {
      textoHeader.textContent = status === 'online' ? 'Online' : (status === 'checking' ? 'Conectando' : 'Desconectado');
    }

    const modalDot = document.getElementById('modal-status-dot');
    const modalTitulo = document.getElementById('modal-status-titulo');
    const modalDetalhe = document.getElementById('modal-status-detalhe');
    const modalBadge = document.getElementById('modal-status-badge');
    const statusBox = document.getElementById('status-box-supabase');

    if (modalDot) modalDot.className = `status-dot ${status}`;
    if (modalTitulo) {
      modalTitulo.textContent = status === 'online' ? 'Conectado ao Supabase' : (status === 'checking' ? 'Verificando Conexão...' : 'Desconectado');
    }
    if (modalDetalhe && mensagem) {
      modalDetalhe.textContent = mensagem;
    }
    if (modalBadge) {
      modalBadge.textContent = status === 'online' ? 'ONLINE' : (status === 'checking' ? 'TESTANDO' : 'OFFLINE');
      modalBadge.style.color = status === 'online' ? '#16a34a' : (status === 'checking' ? '#d97706' : '#ef4444');
    }
    if (statusBox) {
      statusBox.className = `status-box ${status === 'online' ? 'status-box-ok' : (status === 'checking' ? 'status-box-alerta' : 'status-box-erro')}`;
    }
  }

  // Carregamento de dados do Supabase
  async function carregarDados() {
    if (!estado.sessao) return;

    if (!supabaseClient) {
      atualizarStatusSupabase('offline', 'Cliente Supabase não configurado ou credenciais ausentes.');
      renderizarApp();
      return;
    }

    try {
      atualizarStatusSupabase('checking', 'Sincronizando com o Supabase...');
      if (!estado.repertorio || estado.repertorio.length === 0) {
        estado.carregando = true;
        renderizarApp();
      }

      // 1. Carrega o repertório completo de louvores.
      const { data: dadosLouvores, error: erroLouvores } = await supabaseClient
        .from('louvores')
        .select('*')
        .order('titulo', { ascending: true });

      if (erroLouvores) throw erroLouvores;
      const todosLouvores = dadosLouvores || [];
      estado.repertorio = todosLouvores;
      salvarCache('louvores_cache_repertorio', todosLouvores);

      // 2. Carrega os louvores organizados para as terças-feiras.
      const { data: dadosTerca, error: erroTerca } = await supabaseClient
        .from('terca_louvores')
        .select('louvor_id, ordem, data')
        .order('data', { ascending: false })
        .order('ordem', { ascending: true });

      let tercaComOrdem = [];
      if (!erroTerca && dadosTerca) {
        tercaComOrdem = dadosTerca.map(item => {
          const l = todosLouvores.find(louv => louv.id === item.louvor_id);
          if (!l) return null;
          return { ...l, ordem: item.ordem, data: item.data };
        }).filter(Boolean);
        estado.terca = tercaComOrdem;
        salvarCache('louvores_cache_terca', tercaComOrdem);
      }

      // 3. Carrega os louvores organizados para os domingos.
      const { data: dadosDomingo, error: erroDomingo } = await supabaseClient
        .from('domingo_louvores')
        .select('louvor_id, ordem, data')
        .order('data', { ascending: false })
        .order('ordem', { ascending: true });

      let domingoComOrdem = [];
      if (!erroDomingo && dadosDomingo) {
        domingoComOrdem = dadosDomingo.map(item => {
          const l = todosLouvores.find(louv => louv.id === item.louvor_id);
          if (!l) return null;
          return { ...l, ordem: item.ordem, data: item.data };
        }).filter(Boolean);
        estado.domingo = domingoComOrdem;
        salvarCache('louvores_cache_domingo', domingoComOrdem);
      }

      // 4. Carrega e organiza o histórico de uso por aba e data.
      const { data: dadosHistorico, error: erroHist } = await supabaseClient
        .from('louvor_historico')
        .select('louvor_id, tab, data_uso, created_at')
        .is('deleted_at', null)
        .order('data_uso', { ascending: false })
        .order('created_at', { ascending: true });

      if (!erroHist && dadosHistorico) {
        const histTerca = [];
        const histDomingo = [];

        dadosHistorico.forEach(h => {
          const louvor = todosLouvores.find(l => l.id === h.louvor_id);
          if (!louvor) return;
          const itemHist = { ...louvor, data: h.data_uso };

          if (h.tab === 'terca') {
            const itemAtivo = tercaComOrdem.find(a => a.id === h.louvor_id && a.data === h.data_uso);
            itemHist.ordem = (itemAtivo && itemAtivo.ordem !== undefined) ? itemAtivo.ordem : 999999;
            histTerca.push(itemHist);
          } else if (h.tab === 'domingo') {
            const itemAtivo = domingoComOrdem.find(a => a.id === h.louvor_id && a.data === h.data_uso);
            itemHist.ordem = (itemAtivo && itemAtivo.ordem !== undefined) ? itemAtivo.ordem : 999999;
            histDomingo.push(itemHist);
          }
        });

        const ordenarHist = lista => lista.sort((a, b) => {
          if (a.data !== b.data) return (a.data || '') > (b.data || '') ? -1 : 1;
          if (a.ordem !== 999999 && b.ordem !== 999999) return (a.ordem || 0) - (b.ordem || 0);
          return 0;
        });

        estado.historicoTerca = ordenarHist(histTerca);
        estado.historicoDomingo = ordenarHist(histDomingo);
        salvarCache('louvores_cache_hist_terca', estado.historicoTerca);
        salvarCache('louvores_cache_hist_domingo', estado.historicoDomingo);
      }

      // 5. Atualiza a frequência de uso dos últimos 12 meses.
      await carregarContagemUso(todosLouvores);

      atualizarStatusSupabase('online', 'Conectado e sincronizado com o Supabase com sucesso!');
    } catch (err) {
      console.warn("Aviso ao sincronizar dados com Supabase:", err);
      const msgErro = err?.message || (typeof err === 'string' ? err : 'Falha na resolução de endereço/DNS. O projeto pode estar pausado no Supabase.');
      atualizarStatusSupabase('offline', `Erro de conexão: ${msgErro}. O projeto pode estar pausado ou a URL incorreta.`);
      mostrarToast("Supabase Desconectado", "O projeto do Supabase pode estar pausado ou inacessível.", "error");
    } finally {
      estado.carregando = false;
      renderizarApp();
    }
  }

  // Contagem de uso
  async function carregarContagemUso(louvores) {
    if (!supabaseClient) return;
    try {
      const dataCorte = new Date();
      dataCorte.setMonth(dataCorte.getMonth() - 12);
      const dataCorteStr = dataCorte.toISOString().split("T")[0];
      const hoje = new Date().toISOString().split("T")[0];

      const { data: hist } = await supabaseClient
        .from('louvor_historico')
        .select('louvor_id, data_uso, deleted_at')
        .gte('data_uso', dataCorteStr);

      if (hist) {
        estado.repertorio = louvores.map(louvor => {
          const contagem = hist.filter(h => {
            if (h.louvor_id !== louvor.id) return false;
            if (h.deleted_at) return h.data_uso < hoje;
            return true;
          }).length;
          return { ...louvor, usageCount: contagem };
        });
        salvarCache('louvores_cache_repertorio', estado.repertorio);
      }
    } catch (e) {
      console.error("Erro contagem uso:", e);
    }
  }

  // Adicionar Louvor
  async function adicionarLouvor(dados) {
    if (!supabaseClient) {
      mostrarToast("Erro", "Supabase não conectado", "error");
      return;
    }
    try {
      const cadastro = new Date().toLocaleDateString('pt-BR');
      const { data, error } = await supabaseClient
        .from('louvores')
        .insert([{ ...dados, cadastro }])
        .select()
        .single();

      if (error) throw error;
      estado.repertorio = [data, ...estado.repertorio];
      salvarCache('louvores_cache_repertorio', estado.repertorio);
      renderizarApp();
      mostrarToast("Sucesso", "Louvor adicionado ao repertório!");
      fecharModalLouvor();
    } catch (e) {
      console.error("Erro ao adicionar:", e);
      mostrarToast("Erro", "Falha ao adicionar louvor", "error");
    }
  }

  // Atualizar Louvor
  async function atualizarLouvor(louvor) {
    if (!supabaseClient) return;
    try {
      const { id, ...resto } = louvor;
      const { error } = await supabaseClient
        .from('louvores')
        .update({
          titulo: louvor.titulo,
          artista: louvor.artista,
          tonalidade: louvor.tonalidade,
          letra: louvor.letra,
          cifra: louvor.cifra,
          youtube: louvor.youtube
        })
        .eq('id', id);

      if (error) throw error;
      await carregarDados();
      mostrarToast("Sucesso", "Louvor atualizado!");
      fecharModalLouvor();
    } catch (e) {
      console.error("Erro ao atualizar:", e);
      mostrarToast("Erro", "Falha ao atualizar louvor", "error");
    }
  }

  // Excluir Louvor
  async function excluirLouvor(aba, id) {
    if (!supabaseClient) return;
    try {
      if (aba === 'repertorio') {
        const { error } = await supabaseClient.from('louvores').delete().eq('id', id);
        if (error) throw error;

        estado.repertorio = estado.repertorio.filter(l => l.id !== id);
        estado.terca = estado.terca.filter(l => l.id !== id);
        estado.domingo = estado.domingo.filter(l => l.id !== id);
        estado.historicoTerca = estado.historicoTerca.filter(l => l.id !== id);
        estado.historicoDomingo = estado.historicoDomingo.filter(l => l.id !== id);

        salvarCache('louvores_cache_repertorio', estado.repertorio);
        salvarCache('louvores_cache_terca', estado.terca);
        salvarCache('louvores_cache_domingo', estado.domingo);
        mostrarToast("Sucesso", "Louvor removido do repertório!");
      } else {
        const tabela = aba === 'terca' ? 'terca_louvores' : 'domingo_louvores';
        const listaAtual = aba === 'terca' ? estado.terca : estado.domingo;
        const item = listaAtual.find(l => l.id === id);

        const { error } = await supabaseClient.from(tabela).delete().eq('louvor_id', id);
        if (error) throw error;

        if (item && item.data) {
          await supabaseClient
            .from('louvor_historico')
            .delete()
            .eq('louvor_id', id)
            .eq('tab', aba)
            .eq('data_uso', item.data);
        }

        await carregarDados();
        mostrarToast("Sucesso", `Louvor removido de ${aba === 'terca' ? 'Terça' : 'Domingo'}!`);
      }
      renderizarApp();
    } catch (e) {
      console.error("Erro ao excluir:", e);
      mostrarToast("Erro", "Falha ao excluir louvor", "error");
    }
  }

  // Enviar Louvor para Terça ou Domingo com Data
  async function enviarParaAba(louvor, abaAlvo, data) {
    if (!supabaseClient) return;
    try {
      const listaAtual = abaAlvo === 'terca' ? estado.terca : estado.domingo;
      const ordem = listaAtual.length;
      const tabela = abaAlvo === 'terca' ? 'terca_louvores' : 'domingo_louvores';

      const { error } = await supabaseClient
        .from(tabela)
        .insert([{ louvor_id: louvor.id, ordem, data }]);

      if (error) throw error;

      await supabaseClient
        .from('louvor_historico')
        .insert([{ louvor_id: louvor.id, tab: abaAlvo, data_uso: data }]);

      await carregarDados();
      mostrarToast("Sucesso", `Louvor enviado para ${abaAlvo === 'terca' ? 'Terça' : 'Domingo'}!`);
    } catch (e) {
      console.error("Erro ao enviar:", e);
      mostrarToast("Erro", "Falha ao enviar louvor", "error");
    }
  }

  // Reordenar Louvores
  async function reordenarLouvores(aba, indiceInicial, indiceFinal) {
    if (!supabaseClient || indiceInicial === indiceFinal) return;
    const lista = aba === 'terca' ? [...estado.terca] : [...estado.domingo];
    const tabela = aba === 'terca' ? 'terca_louvores' : 'domingo_louvores';

    const [removido] = lista.splice(indiceInicial, 1);
    lista.splice(indiceFinal, 0, removido);

    // Atualiza a interface imediatamente, antes da confirmação do servidor.
    if (aba === 'terca') estado.terca = lista.map((item, idx) => ({ ...item, ordem: idx }));
    else estado.domingo = lista.map((item, idx) => ({ ...item, ordem: idx }));
    renderizarApp();

    try {
      const promises = lista.map((item, index) => {
        if (!item.data) return Promise.resolve();
        return supabaseClient
          .from(tabela)
          .update({ ordem: index })
          .match({ louvor_id: item.id, data: item.data });
      });

      await Promise.all(promises);
      await carregarDados();
      mostrarToast("Sucesso", "Ordem atualizada com sucesso!");
    } catch (e) {
      console.error("Erro ao reordenar:", e);
      mostrarToast("Erro", "Falha ao salvar nova ordem", "error");
      await carregarDados();
    }
  }

  // Compartilhamento via WhatsApp
  function compartilharWhatsApp(tipo) {
    if (tipo === 'repertorio') {
      const ordenados = [...estado.repertorio].sort((a, b) => a.titulo.localeCompare(b.titulo));
      const msg = `*Repertório Completo*\n\n` +
        ordenados.map((l, i) => `${i + 1} - *${l.titulo}* (${l.tonalidade}) - ${l.artista}`).join("\n");
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      const eTerca = tipo === 'terca';
      const lista = eTerca ? estado.terca : estado.domingo;
      const dataExibicao = obterDataExibicao(lista);
      if (!dataExibicao) return;

      const musicas = lista.filter(l => l.data === dataExibicao);
      const dataFormatada = dataExibicao.split('-').reverse().join('/');
      const msg = `*Lista de Louvor - ${dataFormatada}*\n\n` +
        musicas.map((l, i) => `${i + 1} - *${l.titulo}* (${l.tonalidade})\n${l.artista}${l.youtube ? `\n${l.youtube}` : ''}`).join("\n\n");
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  }

  // Renderização da Interface
  function renderizarApp() {
    atualizarBadges();
    atualizarVisibilidadeToolbar();
    renderizarLista();
  }

  function atualizarBadges() {
    const badgeRep = document.getElementById('badge-repertorio');
    const badgeTerca = document.getElementById('badge-terca');
    const badgeDom = document.getElementById('badge-domingo');

    if (badgeRep) badgeRep.textContent = estado.repertorio.length;

    if (badgeTerca) {
      const dataT = obterDataExibicao(estado.terca);
      badgeTerca.textContent = dataT ? estado.terca.filter(l => l.data === dataT).length : 0;
    }

    if (badgeDom) {
      const dataD = obterDataExibicao(estado.domingo);
      badgeDom.textContent = dataD ? estado.domingo.filter(l => l.data === dataD).length : 0;
    }
  }

  function atualizarVisibilidadeToolbar() {
    const btnAdd = document.getElementById('btn-adicionar-louvor');
    const btnSort = document.getElementById('btn-ordenar-uso');
    const btnShareRep = document.getElementById('btn-compartilhar-repertorio');
    const btnShareList = document.getElementById('btn-compartilhar-lista');
    const btnHist = document.getElementById('btn-historico-toggle');
    const toolbar = document.getElementById('toolbar-controles');
    const estaEmEscala = estado.abaAtiva === 'terca' || estado.abaAtiva === 'domingo';
    const conteudoLista = document.querySelector('.conteudo-lista');

    if (toolbar) toolbar.classList.toggle('toolbar-controles-escala', estaEmEscala);
    if (conteudoLista) conteudoLista.classList.toggle('conteudo-lista-escala', estaEmEscala);

    if (estado.abaAtiva === 'repertorio') {
      if (btnAdd) btnAdd.style.display = 'inline-flex';
      if (btnSort) btnSort.style.display = 'inline-flex';
      if (btnShareRep) btnShareRep.style.display = 'inline-flex';
      if (btnShareList) btnShareList.style.display = 'none';
      if (btnHist) btnHist.style.display = 'none';
    } else {
      if (btnAdd) btnAdd.style.display = 'none';
      if (btnSort) btnSort.style.display = 'none';
      if (btnShareRep) btnShareRep.style.display = 'none';
      if (btnShareList) btnShareList.style.display = 'inline-flex';
      if (btnHist) {
        btnHist.style.display = 'inline-flex';
        btnHist.classList.toggle('btn-toolbar-ativo', estado.mostrarHistorico);
        btnHist.title = estado.mostrarHistorico ? "Ver Lista Atual" : "Ver Histórico Completo";
      }
    }

    if (btnSort) {
      btnSort.classList.toggle('btn-toolbar-ativo', estado.ordenarPorUso);
    }
  }

  function renderizarLista() {
    const container = document.getElementById('lista-louvores');
    if (!container) return;

    if (estado.carregando && (!estado.repertorio || estado.repertorio.length === 0)) {
      container.innerHTML = `
        <div class="conteiner-carregamento">
          <div class="spinner"></div>
          <p style="color: var(--muted-foreground); font-weight: 600;">Carregando louvores...</p>
        </div>
      `;
      return;
    }

    let itens = [];
    const aba = estado.abaAtiva;

    if (aba === 'repertorio') {
      itens = [...estado.repertorio];
    } else if (aba === 'terca') {
      if (estado.mostrarHistorico) {
        itens = [...estado.historicoTerca];
      } else {
        const dataEx = obterDataExibicao(estado.terca);
        itens = dataEx ? estado.terca.filter(l => l.data === dataEx) : [];
      }
    } else if (aba === 'domingo') {
      if (estado.mostrarHistorico) {
        itens = [...estado.historicoDomingo];
      } else {
        const dataEx = obterDataExibicao(estado.domingo);
        itens = dataEx ? estado.domingo.filter(l => l.data === dataEx) : [];
      }
    }

    // Filtrar pesquisa
    const termo = normalizarTexto(estado.termoPesquisa);
    if (termo) {
      itens = itens.filter(item =>
        normalizarTexto(item.titulo).includes(termo) ||
        normalizarTexto(item.artista).includes(termo)
      );
    }

    // Ordenação por uso em repertório
    if (aba === 'repertorio' && estado.ordenarPorUso) {
      itens.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    }

    // Lista Vazia
    if (itens.length === 0) {
      const subtituloVazio = aba === 'repertorio'
        ? 'Toque no botão + para adicionar seu primeiro louvor'
        : 'Envie louvores do repertório para cá';
      container.innerHTML = `
        <div class="lista-vazia-container">
          <i class="fa-regular fa-folder-open"></i>
          <div class="lista-vazia-titulo">Nenhum louvor encontrado</div>
          <div class="lista-vazia-subtitulo">
            ${subtituloVazio}
          </div>
        </div>
      `;
      return;
    }

    // Se estiver em modo histórico (agrupado por data)
    if ((aba === 'terca' || aba === 'domingo') && estado.mostrarHistorico) {
      const grupos = {};
      itens.forEach(l => {
        const dt = l.data || 'sem-data';
        if (!grupos[dt]) grupos[dt] = [];
        grupos[dt].push(l);
      });

      const datasOrdenadas = Object.keys(grupos).sort((a, b) => {
        if (a === 'sem-data') return 1;
        if (b === 'sem-data') return -1;
        return b.localeCompare(a);
      });

      let html = '';
      datasOrdenadas.forEach(dataKey => {
        const louvoresDoGrupo = grupos[dataKey];
        html += `
          <div class="grupo-data-container">
            <div class="grupo-data-header">
              <i class="fa-regular fa-calendar"></i>
              <div class="grupo-data-titulo">${formatarData(dataKey)}</div>
              <span class="grupo-data-contador">${louvoresDoGrupo.length} ${louvoresDoGrupo.length === 1 ? 'louvor' : 'louvores'}</span>
            </div>
            <div class="lista-louvores-container">
              ${louvoresDoGrupo.map(l => renderizarCardHTML(l, aba, false, true)).join('')}
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
      vincularEventosCards();
      return;
    }

    // Modo normal (arrastável na terça/domingo e lista padrão no repertório)
    const eArrastavel = (aba === 'terca' || aba === 'domingo') && !estado.mostrarHistorico;
    let cabecalhoData = '';
    if (aba === 'terca' || aba === 'domingo') {
      const listaEscala = aba === 'terca' ? estado.terca : estado.domingo;
      const dataEscala = obterDataExibicao(listaEscala);
      if (dataEscala) {
        const quantidade = listaEscala.filter(l => l.data === dataEscala).length;
        cabecalhoData = `
          <div class="grupo-data-header">
            <i class="fa-regular fa-calendar"></i>
            <div class="grupo-data-titulo">${formatarData(dataEscala)}</div>
            <span class="grupo-data-contador">${quantidade} ${quantidade === 1 ? 'louvor' : 'louvores'}</span>
          </div>
        `;
      }
    }
    container.innerHTML = cabecalhoData + itens.map((l, index) => renderizarCardHTML(l, aba, eArrastavel, false, index)).join('');
    vincularEventosCards();
    if (eArrastavel) {
      configurarDragAndDrop(container, aba);
    }
  }

  // Gera a marcação HTML de um card de louvor.
  function renderizarCardHTML(louvor, aba, arrastavel = false, modoHistorico = false, index = 0) {
    const ehRepertorio = aba === 'repertorio';
    const chaveTom = louvor.tonalidade ? (louvor.tonalidade.charAt(0).toUpperCase() + louvor.tonalidade.slice(1).toLowerCase()) : '';

    return `
      <div class="item-arrastavel" data-id="${louvor.id}" data-index="${index}" ${arrastavel ? 'draggable="true"' : ''}>
        <div class="louvor-card">
          <div class="louvor-content">
            <div class="louvor-header">
              <div class="louvor-drag-section">
                ${arrastavel ? `
                  <div class="louvor-drag-handle" title="Arraste para reordenar">
                    <i class="fa-solid fa-grip-vertical"></i>
                  </div>
                ` : ''}
                <div class="louvor-info">
                  <div class="louvor-title-row">
                    <h3 class="louvor-title" title="${louvor.titulo}">${louvor.titulo}</h3>
                    ${ehRepertorio && louvor.usageCount ? `
                      <span class="louvor-usage-badge" title="Usado ${louvor.usageCount} vez(es) nos últimos 12 meses">
                        ${louvor.usageCount}
                      </span>
                    ` : ''}
                  </div>
                  <p class="louvor-artist">${louvor.artista || ''}</p>
                </div>
              </div>

              <div class="louvor-actions">
                ${!modoHistorico ? `
                  <button class="louvor-action-btn btn-editar-card" data-id="${louvor.id}" title="Editar Louvor">
                    <i class="fa-regular fa-pen-to-square"></i>
                  </button>
                ` : ''}

                ${!modoHistorico && (aba === 'terca' || aba === 'domingo') ? `
                  <button class="louvor-action-btn delete-btn btn-excluir-card" data-id="${louvor.id}" title="Remover Louvor">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                ` : ''}

                <div class="dropdown-menu-wrapper">
                  <button class="louvor-action-btn btn-dropdown-trigger" data-id="${louvor.id}" title="Enviar para...">
                    <i class="fa-solid fa-paper-plane"></i>
                  </button>
                  <div class="dropdown-menu-content" id="dropdown-${louvor.id}">
                    <button class="dropdown-item btn-enviar-para" data-id="${louvor.id}" data-alvo="terca">
                      <span>Enviar para Terça</span>
                    </button>
                    <button class="dropdown-item btn-enviar-para" data-id="${louvor.id}" data-alvo="domingo">
                      <span>Enviar para Domingo</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="louvor-footer">
              <span class="louvor-key-badge">${chaveTom}</span>
              <div class="louvor-links">
                ${louvor.cifra ? `<a href="${louvor.cifra}" target="_blank" rel="noopener noreferrer" class="louvor-link-button">Cifra</a>` : ''}
                ${louvor.letra ? `<a href="${louvor.letra}" target="_blank" rel="noopener noreferrer" class="louvor-link-button">Letra</a>` : ''}
                ${louvor.youtube ? `<a href="${louvor.youtube}" target="_blank" rel="noopener noreferrer" class="louvor-link-button">Youtube</a>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Vincular eventos dos cards
  function vincularEventosCards() {
    // Editar
    document.querySelectorAll('.btn-editar-card').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const louvor = estado.repertorio.find(l => l.id === id) ||
                       estado.terca.find(l => l.id === id) ||
                       estado.domingo.find(l => l.id === id);
        if (louvor) abrirModalLouvor(louvor);
      };
    });

    // Excluir de Terça/Domingo
    document.querySelectorAll('.btn-excluir-card').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        abrirModalConfirmacao(
          `Remover de ${estado.abaAtiva === 'terca' ? 'Terça' : 'Domingo'}?`,
          "Deseja remover este louvor da escala ativa?",
          () => excluirLouvor(estado.abaAtiva, id)
        );
      };
    });

    // Abre ou fecha o menu de ações do card.
    document.querySelectorAll('.btn-dropdown-trigger').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const dropdown = document.getElementById(`dropdown-${id}`);
        // Fecha os outros menus antes de abrir este.
        document.querySelectorAll('.dropdown-menu-content.ativo').forEach(d => {
          if (d !== dropdown) d.classList.remove('ativo');
        });
        if (dropdown) dropdown.classList.toggle('ativo');
      };
    });

    // Enviar para
    document.querySelectorAll('.btn-enviar-para').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const alvo = btn.dataset.alvo;
        const louvor = estado.repertorio.find(l => l.id === id) ||
                       estado.terca.find(l => l.id === id) ||
                       estado.domingo.find(l => l.id === id);

        document.querySelectorAll('.dropdown-menu-content.ativo').forEach(d => d.classList.remove('ativo'));
        if (louvor) abrirModalData(louvor, alvo);
      };
    });
  }

  // Fecha os menus suspensos quando o usuário clica fora deles.
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu-content.ativo').forEach(d => d.classList.remove('ativo'));
  });

  // Configura a reordenação dos cards com mouse e toque.
  function configurarDragAndDrop(container, aba) {
    let itemArrastando = null;
    let indiceOrigem = null;

    const itens = container.querySelectorAll('.item-arrastavel');

    itens.forEach(item => {
      // Habilita o arraste e a soltura com mouse em computadores.
      item.addEventListener('dragstart', (e) => {
        itemArrastando = item;
        indiceOrigem = parseInt(item.dataset.index, 10);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', indiceOrigem);
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (item !== itemArrastando) item.classList.add('over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('over');
        if (itemArrastando && item !== itemArrastando) {
          const indiceDestino = parseInt(item.dataset.index, 10);
          reordenarLouvores(aba, indiceOrigem, indiceDestino);
        }
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        itens.forEach(i => i.classList.remove('over'));
        itemArrastando = null;
      });

      // Habilita o arraste por toque usando o controle do card no celular.
      const handle = item.querySelector('.louvor-drag-handle');
      if (handle) {
        let touchStartY = 0;
        let itemAlvoTouch = null;

        handle.addEventListener('touchstart', (e) => {
          touchStartY = e.touches[0].clientY;
          indiceOrigem = parseInt(item.dataset.index, 10);
          item.classList.add('dragging');
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
          const currentY = e.touches[0].clientY;
          const elementUnder = document.elementFromPoint(e.touches[0].clientX, currentY);
          const targetCard = elementUnder ? elementUnder.closest('.item-arrastavel') : null;

          itens.forEach(i => i.classList.remove('over'));
          if (targetCard && targetCard !== item) {
            targetCard.classList.add('over');
            itemAlvoTouch = targetCard;
          }
        }, { passive: true });

        handle.addEventListener('touchend', () => {
          item.classList.remove('dragging');
          itens.forEach(i => i.classList.remove('over'));
          if (itemAlvoTouch && itemAlvoTouch !== item) {
            const indiceDestino = parseInt(itemAlvoTouch.dataset.index, 10);
            reordenarLouvores(aba, indiceOrigem, indiceDestino);
          }
          itemAlvoTouch = null;
        });
      }
    });
  }

  // Controla a abertura, o fechamento e o conteúdo dos modais.
  function abrirModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('aberto');
    window.history.pushState({ modalAberto: id }, '');
  }

  function fecharModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('aberto');
  }

  window.addEventListener('popstate', () => {
    document.querySelectorAll('.modal-backdrop.aberto').forEach(m => m.classList.remove('aberto'));
  });

  // Modal Louvor (Adicionar/Editar)
  function abrirModalLouvor(louvor = null) {
    estado.louvorEditando = louvor;
    const titulo = document.getElementById('modal-louvor-titulo');
    const subtitulo = document.getElementById('modal-louvor-subtitulo');
    const btnExcluir = document.getElementById('btn-excluir-modal-louvor');

    const campoTitulo = document.getElementById('campo-titulo');
    const campoArtista = document.getElementById('campo-artista');
    const campoTom = document.getElementById('campo-tonalidade');
    const campoCifra = document.getElementById('campo-cifra');
    const campoLetra = document.getElementById('campo-letra');
    const campoYoutube = document.getElementById('campo-youtube');

    if (louvor) {
      titulo.textContent = 'Editar Louvor';
      subtitulo.textContent = louvor.cadastro ? `Cadastrado em: ${louvor.cadastro}` : 'Altere os dados do louvor';
      btnExcluir.style.display = 'inline-flex';
      document.getElementById('texto-excluir-modal').textContent = estado.abaAtiva === 'repertorio' ? 'Excluir' : 'Remover';

      campoTitulo.value = louvor.titulo || '';
      campoArtista.value = louvor.artista || '';
      campoTom.value = louvor.tonalidade || '';
      campoCifra.value = louvor.cifra || '';
      campoLetra.value = louvor.letra || '';
      campoYoutube.value = louvor.youtube || '';
    } else {
      titulo.textContent = 'Adicionar Louvor';
      subtitulo.textContent = 'Adicione um novo louvor ao seu repertório';
      btnExcluir.style.display = 'none';

      campoTitulo.value = '';
      campoArtista.value = '';
      campoTom.value = '';
      campoCifra.value = '';
      campoLetra.value = '';
      campoYoutube.value = '';
    }

    abrirModal('modal-louvor');
  }

  function fecharModalLouvor() {
    fecharModal('modal-louvor');
    estado.louvorEditando = null;
  }

  // Modal Data
  function abrirModalData(louvor, abaAlvo) {
    estado.louvorParaEnvio = { louvor, abaAlvo };
    const desc = document.getElementById('modal-data-descricao');
    const campoData = document.getElementById('campo-data-evento');

    if (desc) desc.textContent = `Escolha a data para enviar "${louvor.titulo}" para ${abaAlvo === 'terca' ? 'Terça' : 'Domingo'}`;

    // Sugere a próxima terça-feira ou o próximo domingo.
    const hoje = new Date();
    const diaSemana = hoje.getDay(); // 0 representa domingo e 2 representa terça-feira.
    const targetDay = abaAlvo === 'terca' ? 2 : 0;
    let diasAte = (targetDay - diaSemana + 7) % 7;
    const dataAlvo = new Date(hoje);
    dataAlvo.setDate(hoje.getDate() + diasAte);

    const ano = dataAlvo.getFullYear();
    const mes = String(dataAlvo.getMonth() + 1).padStart(2, "0");
    const dia = String(dataAlvo.getDate()).padStart(2, "0");
    campoData.value = `${ano}-${mes}-${dia}`;

    abrirModal('modal-data');
  }

  // Modal Confirmação
  function abrirModalConfirmacao(titulo, mensagem, aoConfirmar) {
    estado.confirmacaoAcao = aoConfirmar;
    document.getElementById('modal-confirm-titulo').textContent = titulo;
    document.getElementById('modal-confirm-mensagem').textContent = mensagem;
    abrirModal('modal-confirmacao');
  }

  // Modal Instalação PWA
  function abrirModalInstalacao() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const titulo = document.getElementById('modal-instalar-titulo');
    const corpo = document.getElementById('modal-instalar-corpo');

    if (isIOS) {
      titulo.textContent = 'Instalar no iPhone ou iPad';
      corpo.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem;">
          <div style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; background: var(--secondary); border-radius: 0.5rem;">
            <svg style="width: 1.25rem; height: 1.25rem; color: var(--primary); flex-shrink: 0;"><use href="#icon-share"></use></svg>
            <div>
              <strong>1. Toque em Compartilhar</strong>
              <p style="color: var(--muted-foreground); font-size: 0.75rem; margin-top: 0.2rem;">
                No Safari do iPhone, toque no botão de compartilhar na barra inferior.
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; background: var(--secondary); border-radius: 0.5rem;">
            <svg style="width: 1.25rem; height: 1.25rem; color: var(--primary); flex-shrink: 0;"><use href="#icon-plus"></use></svg>
            <div>
              <strong>2. "Adicionar à Tela de Início"</strong>
              <p style="color: var(--muted-foreground); font-size: 0.75rem; margin-top: 0.2rem;">
                Role o menu para baixo e selecione <strong>Adicionar à Tela de Início</strong>.
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; background: var(--secondary); border-radius: 0.5rem;">
            <svg style="width: 1.25rem; height: 1.25rem; color: #16a34a; flex-shrink: 0;"><use href="#icon-download"></use></svg>
            <div>
              <strong>3. Confirme em "Adicionar"</strong>
              <p style="color: var(--muted-foreground); font-size: 0.75rem; margin-top: 0.2rem;">
                O ícone do Louvores aparecerá na sua tela inicial funcionando como aplicativo nativo!
              </p>
            </div>
          </div>
        </div>
      `;
    } else {
      titulo.textContent = 'Instalar Aplicativo Louvores';
      corpo.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem;">
          <div style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; background: var(--secondary); border-radius: 0.5rem;">
            <svg style="width: 1.25rem; height: 1.25rem; color: var(--primary); flex-shrink: 0;"><use href="#icon-download"></use></svg>
            <div>
              <strong>1. Menu do Navegador</strong>
              <p style="color: var(--muted-foreground); font-size: 0.75rem; margin-top: 0.2rem;">
                Toque nos três pontinhos no canto superior do navegador Chrome ou Edge.
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; background: var(--secondary); border-radius: 0.5rem;">
            <svg style="width: 1.25rem; height: 1.25rem; color: #16a34a; flex-shrink: 0;"><use href="#icon-plus"></use></svg>
            <div>
              <strong>2. "Instalar aplicativo"</strong>
              <p style="color: var(--muted-foreground); font-size: 0.75rem; margin-top: 0.2rem;">
                Selecione "Instalar aplicativo" ou "Adicionar à tela inicial" e confirme.
              </p>
            </div>
          </div>
        </div>
      `;
    }

    abrirModal('modal-instalacao');
  }

  // Inicializa a interface e associa os eventos aos controles.
  function inicializarUI() {
    // Abas
    document.querySelectorAll('.gatilho-aba').forEach(btn => {
      btn.onclick = () => {
        const aba = btn.dataset.aba;
        estado.abaAtiva = aba;
        estado.mostrarHistorico = false;
        if (aba !== 'repertorio') {
          estado.termoPesquisa = '';
          const inputPesquisa = document.getElementById('input-pesquisa');
          if (inputPesquisa) inputPesquisa.value = '';
        }
        localStorage.setItem('activeTab', aba);

        document.querySelectorAll('.gatilho-aba').forEach(b => b.classList.remove('ativa'));
        btn.classList.add('ativa');
        renderizarApp();
      };
    });

    // Pesquisa
    const inputPesquisa = document.getElementById('input-pesquisa');
    if (inputPesquisa) {
      inputPesquisa.addEventListener('input', (e) => {
        estado.termoPesquisa = e.target.value;
        renderizarLista();
      });
    }

    // Configura os botões da barra de controles.
    const btnAdd = document.getElementById('btn-adicionar-louvor');
    if (btnAdd) btnAdd.onclick = () => abrirModalLouvor(null);

    const btnSort = document.getElementById('btn-ordenar-uso');
    if (btnSort) btnSort.onclick = () => {
      estado.ordenarPorUso = !estado.ordenarPorUso;
      renderizarApp();
    };

    const btnShareRep = document.getElementById('btn-compartilhar-repertorio');
    if (btnShareRep) btnShareRep.onclick = () => {
      abrirModalConfirmacao(
        "WhatsApp",
        "Deseja enviar o repertório completo pelo WhatsApp?",
        () => compartilharWhatsApp('repertorio')
      );
    };

    const btnShareList = document.getElementById('btn-compartilhar-lista');
    if (btnShareList) btnShareList.onclick = () => {
      abrirModalConfirmacao(
        "WhatsApp",
        `Deseja enviar a lista de ${estado.abaAtiva === 'terca' ? 'Terça' : 'Domingo'} pelo WhatsApp?`,
        () => compartilharWhatsApp(estado.abaAtiva)
      );
    };

    const btnHist = document.getElementById('btn-historico-toggle');
    if (btnHist) btnHist.onclick = () => {
      estado.mostrarHistorico = !estado.mostrarHistorico;
      renderizarApp();
    };

    // Processa o envio do formulário de cadastro ou edição de louvor.
    const formLouvor = document.getElementById('form-louvor');
    if (formLouvor) {
      formLouvor.onsubmit = (e) => {
        e.preventDefault();
        const dados = {
          titulo: document.getElementById('campo-titulo').value.trim(),
          artista: document.getElementById('campo-artista').value.trim(),
          tonalidade: document.getElementById('campo-tonalidade').value,
          cifra: document.getElementById('campo-cifra').value.trim(),
          letra: document.getElementById('campo-letra').value.trim(),
          youtube: document.getElementById('campo-youtube').value.trim()
        };

        if (estado.louvorEditando) {
          atualizarLouvor({ ...estado.louvorEditando, ...dados });
        } else {
          adicionarLouvor(dados);
        }
      };
    }

    document.getElementById('btn-cancelar-louvor').onclick = fecharModalLouvor;
    document.getElementById('btn-excluir-modal-louvor').onclick = () => {
      if (estado.louvorEditando) {
        const id = estado.louvorEditando.id;
        abrirModalConfirmacao(
          "Confirmar exclusão",
          estado.abaAtiva === 'repertorio' ? "Deseja excluir este louvor definitivamente?" : "Deseja remover este louvor?",
          () => {
            excluirLouvor(estado.abaAtiva, id);
            fecharModalLouvor();
          }
        );
      }
    };

    // Modal Data
    document.getElementById('btn-cancelar-data').onclick = () => fecharModal('modal-data');
    document.getElementById('btn-confirmar-data').onclick = () => {
      const dataVal = document.getElementById('campo-data-evento').value;
      if (dataVal && estado.louvorParaEnvio) {
        enviarParaAba(estado.louvorParaEnvio.louvor, estado.louvorParaEnvio.abaAlvo, dataVal);
        fecharModal('modal-data');
        estado.louvorParaEnvio = null;
      }
    };

    // Modal Confirmação
    document.getElementById('btn-confirm-nao').onclick = () => fecharModal('modal-confirmacao');
    document.getElementById('btn-confirm-sim').onclick = () => {
      if (estado.confirmacaoAcao) estado.confirmacaoAcao();
      fecharModal('modal-confirmacao');
      estado.confirmacaoAcao = null;
    };

    // Modal Instalação
    document.getElementById('btn-fechar-instalacao').onclick = () => fecharModal('modal-instalacao');

    // Modal Configurações do Supabase
    const btnConfigSupabase = document.getElementById('btn-config-supabase');
    if (btnConfigSupabase) {
      btnConfigSupabase.onclick = () => {
        const config = obterConfigSupabase();
        const campoUrl = document.getElementById('campo-supabase-url');
        const campoKey = document.getElementById('campo-supabase-key');
        if (campoUrl) campoUrl.value = config.url;
        if (campoKey) campoKey.value = config.key;
        atualizarStatusSupabase(estado.statusSupabase, estado.mensagemSupabase);
        abrirModal('modal-supabase');
      };
    }

    const btnCancelarSupabase = document.getElementById('btn-cancelar-supabase');
    if (btnCancelarSupabase) {
      btnCancelarSupabase.onclick = () => fecharModal('modal-supabase');
    }

    const btnRestaurarSupabase = document.getElementById('btn-restaurar-supabase');
    if (btnRestaurarSupabase) {
      btnRestaurarSupabase.onclick = () => {
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_anon_key');
        const campoUrl = document.getElementById('campo-supabase-url');
        const campoKey = document.getElementById('campo-supabase-key');
        if (campoUrl) campoUrl.value = SUPABASE_URL_PADRAO;
        if (campoKey) campoKey.value = SUPABASE_ANON_KEY_PADRAO;
        inicializarSupabase();
        mostrarToast("Restaurado", "Credenciais padrão restauradas.");
        atualizarStatusSupabase('checking', 'Testando credenciais padrão...');
        carregarDados();
      };
    }

    const btnTestarSupabase = document.getElementById('btn-testar-supabase');
    if (btnTestarSupabase) {
      btnTestarSupabase.onclick = async () => {
        const url = (document.getElementById('campo-supabase-url').value || '').trim();
        const key = (document.getElementById('campo-supabase-key').value || '').trim();
        if (!url || !key) {
          mostrarToast("Atenção", "Preencha a URL e a API Key antes de testar.", "error");
          return;
        }

        atualizarStatusSupabase('checking', 'Testando conexão com o Supabase...');
        try {
          if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('SDK do Supabase não foi carregado na página.');
          }
          const clienteTeste = window.supabase.createClient(url, key);
          const { data, error } = await clienteTeste.from('louvores').select('id').limit(1);
          if (error) {
            throw error;
          }
          atualizarStatusSupabase('online', 'Sucesso! Conexão estabelecida e tabela "louvores" acessível.');
          mostrarToast("Sucesso", "Conectado ao Supabase com sucesso!");
        } catch (e) {
          console.error("Erro no teste de conexão:", e);
          const detalhe = e.message || 'Falha ao resolver endereço ou projeto inativo/pausado.';
          atualizarStatusSupabase('offline', `Falha: ${detalhe}`);
          mostrarToast("Falha na conexão", detalhe, "error");
        }
      };
    }

    const formSupabase = document.getElementById('form-config-supabase');
    if (formSupabase) {
      formSupabase.onsubmit = async (e) => {
        e.preventDefault();
        const url = (document.getElementById('campo-supabase-url').value || '').trim();
        const key = (document.getElementById('campo-supabase-key').value || '').trim();

        if (!url || !key) {
          mostrarToast("Erro", "URL e API Key são obrigatórios.", "error");
          return;
        }

        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_anon_key', key);
        inicializarSupabase();
        fecharModal('modal-supabase');
        mostrarToast("Salvo!", "Credenciais atualizadas. Sincronizando...");
        await carregarDados();
      };
    }

    // Configura o botão de instalação no cabeçalho.
    const btnInstalar = document.getElementById('btn-instalar-app');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone && btnInstalar) {
      btnInstalar.style.display = 'none';
    } else if (btnInstalar) {
      btnInstalar.onclick = async () => {
        if (estado.deferredPrompt) {
          estado.deferredPrompt.prompt();
          const { outcome } = await estado.deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            btnInstalar.style.display = 'none';
          }
          estado.deferredPrompt = null;
        } else {
          abrirModalInstalacao();
        }
      };
    }

    // Alterna entre os temas escuro e claro e atualiza a barra do sistema.
    const btnTema = document.getElementById('btn-alternar-tema');
    const iconeTema = document.getElementById('icone-tema');

    const temaSalvo = localStorage.getItem('theme');
    const querEscuro = temaSalvo ? temaSalvo === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (querEscuro) {
      document.documentElement.classList.add('dark');
      if (iconeTema) {
        iconeTema.className = 'fa-solid fa-sun';
      }
    }

    const atualizarCorTemaSistema = () => {
      const cor = getComputedStyle(document.documentElement).getPropertyValue('--header-system-color').trim();
      const metaTema = document.querySelector('meta[name="theme-color"]');
      if (metaTema && cor) metaTema.setAttribute('content', cor);
    };
    atualizarCorTemaSistema();

    if (btnTema) {
      btnTema.onclick = () => {
        const ehEscuro = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', ehEscuro ? 'dark' : 'light');
        atualizarCorTemaSistema();
        if (iconeTema) {
          iconeTema.className = ehEscuro ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
      };
    }

    // Configurar aba salva
    const tabInicial = document.querySelector(`.gatilho-aba[data-aba="${estado.abaAtiva}"]`);
    if (tabInicial) {
      document.querySelectorAll('.gatilho-aba').forEach(b => b.classList.remove('ativa'));
      tabInicial.classList.add('ativa');
    }
  }

  // Oculta os dados locais e a interface principal quando não há sessão válida.
  function limparDadosSemSessao() {
    [
      'louvores_cache_repertorio',
      'louvores_cache_terca',
      'louvores_cache_domingo',
      'louvores_cache_hist_terca',
      'louvores_cache_hist_domingo'
    ].forEach(chave => localStorage.removeItem(chave));

    estado.repertorio = [];
    estado.terca = [];
    estado.domingo = [];
    estado.historicoTerca = [];
    estado.historicoDomingo = [];
    estado.termoPesquisa = '';
  }

  // Alterna a tela de login e os controles protegidos conforme a sessão.
  function atualizarAcesso(sessao) {
    estado.sessao = sessao;
    const autenticado = Boolean(sessao);
    const telaAcesso = document.getElementById('auth-screen');
    const areaSuperior = document.querySelector('.area-superior-fixa');
    const conteudoLista = document.querySelector('.conteudo-lista');
    const btnSair = document.getElementById('btn-sair');

    if (telaAcesso) telaAcesso.hidden = autenticado;
    if (areaSuperior) areaSuperior.hidden = !autenticado;
    if (conteudoLista) conteudoLista.hidden = !autenticado;
    if (btnSair) btnSair.style.display = autenticado ? 'inline-flex' : 'none';
  }

  // Autentica contas convidadas pelo painel do Supabase; não há cadastro público.
  function inicializarAutenticacao() {
    const formLogin = document.getElementById('form-login');
    const campoEmail = document.getElementById('auth-email');
    const campoSenha = document.getElementById('auth-password');
    const feedback = document.getElementById('auth-feedback');
    const btnLogin = document.getElementById('btn-login');
    const btnSair = document.getElementById('btn-sair');

    if (formLogin) {
      formLogin.onsubmit = async (evento) => {
        evento.preventDefault();
        if (window.location.protocol === 'file:') {
          if (feedback) feedback.textContent = 'Abra o app por um servidor local ou endereço HTTPS; o login não funciona abrindo o arquivo diretamente.';
          return;
        }

        if (!supabaseClient) {
          if (feedback) feedback.textContent = 'Não foi possível conectar ao serviço de autenticação.';
          return;
        }

        if (feedback) feedback.textContent = '';
        if (btnLogin) {
          btnLogin.disabled = true;
          btnLogin.textContent = 'Entrando...';
        }

        try {
          const { error } = await supabaseClient.auth.signInWithPassword({
            email: campoEmail.value.trim(),
            password: campoSenha.value
          });
          if (error) throw error;
        } catch (erro) {
          console.warn('Falha na autenticação:', erro);
          if (feedback) {
            if (erro?.code === 'email_not_confirmed') {
              feedback.textContent = 'Este e-mail ainda não foi confirmado. Confira a caixa de entrada ou confirme a conta no Supabase.';
            } else if (erro?.code === 'invalid_credentials' || erro?.status === 400) {
              feedback.textContent = 'E-mail ou senha incorretos. Confira também se a conta foi criada com uma senha.';
            } else if (/fetch|network|connection/i.test(erro?.message || '')) {
              feedback.textContent = 'Falha de rede. Confira sua conexão e se a URL do Supabase está correta.';
            } else {
              feedback.textContent = erro?.message || 'Não foi possível entrar. Confira a conta e tente novamente.';
            }
          }
        } finally {
          if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
          }
        }
      };
    }

    if (btnSair) {
      btnSair.onclick = async () => {
        if (!supabaseClient) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) mostrarToast('Erro', 'Não foi possível encerrar a sessão.', 'error');
      };
    }

    if (!supabaseClient) {
      if (feedback) feedback.textContent = 'O serviço de autenticação não está disponível.';
      limparDadosSemSessao();
      atualizarAcesso(null);
      return;
    }

    supabaseClient.auth.onAuthStateChange((evento, sessao) => {
      if (evento !== 'INITIAL_SESSION' && evento !== 'SIGNED_IN' && evento !== 'SIGNED_OUT') return;

      atualizarAcesso(sessao);
      if (sessao) {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
        window.setTimeout(() => carregarDados(), 0);
      } else {
        limparDadosSemSessao();
        renderizarApp();
      }
    });
  }

  // Armazena o evento que permite oferecer a instalação do PWA.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    estado.deferredPrompt = e;
    const btnInstalar = document.getElementById('btn-instalar-app');
    if (btnInstalar) btnInstalar.style.display = 'inline-flex';
  });

  // Registra o service worker para habilitar cache e uso offline.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] Service Worker registrado:', reg.scope))
        .catch(err => console.warn('[PWA] Erro ao registrar Service Worker:', err));
    });
  }

  // Prepara a interface e inicia o carregamento dos dados.
  document.addEventListener('DOMContentLoaded', () => {
    inicializarUI();
    inicializarAutenticacao();
  });

})();
