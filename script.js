document.addEventListener('DOMContentLoaded', () => {
  let autoFetchInterval;
  let lastScramblingState = {};
  let muxes = {};
  let alertEnabled = true; // Variável para controlar o estado do alerta

  // Referência ao elemento do ícone de alerta
  const alertIcon = document.getElementById('alertIcon');

  // Função para salvar o estado de lastScramblingState de um sistema específico no localStorage
  function saveScramblingState(system) {
    const allStates =
      JSON.parse(localStorage.getItem('lastScramblingState')) || {};
    allStates[system] = lastScramblingState;
    localStorage.setItem('lastScramblingState', JSON.stringify(allStates));
  }

  // Função para restaurar o estado de lastScramblingState de um sistema específico do localStorage
  function loadScramblingState(system) {
    const allStates =
      JSON.parse(localStorage.getItem('lastScramblingState')) || {};
    lastScramblingState = allStates[system] || {};
  }

  // Carrega o estado salvo no localStorage ao iniciar
  loadScramblingState();

  // Função para iniciar o efeito de carregamento
  function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    loadingBar.style.width = '0';
    setTimeout(() => {
      loadingBar.style.width = '100%';
    }, 50);
  }

  // Função para popular o select de sistemas com os dados do JSON
  function populateSystemSelect(muxes) {
    const systemSelect = document.getElementById('systemSelect');
    systemSelect.innerHTML = '';
    Object.keys(muxes).forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      systemSelect.appendChild(option);
    });

    // Restaurar sistema selecionado do localStorage
    const selectedSystem = localStorage.getItem('selectedSystem');
    if (selectedSystem && muxes[selectedSystem]) {
      systemSelect.value = selectedSystem;
    }
  }

  // Função para buscar dados da API mockada
  async function fetchData(system, outputElementId, type) {
    startLoadingBar();
    try {
      const systemIP =
        type === 'primary' ? muxes[system].primary : muxes[system].backup;
      const response = await fetch(`http://${systemIP}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar dados da API');
      }
      const data = await response.json();
      const psiData = data.psiData;
      const statsData = data.statsData;

      // Exibe os dados da API
      displayData([], psiData, statsData, outputElementId, system);
      checkForLongScramblingState(psiData, system);
    } catch (error) {
      document.getElementById(
        outputElementId
      ).innerHTML = `<div class="alert alert-danger">Erro ao buscar dados: ${error.message}</div>`;
    }
  }

  function determineCardColor(pidStates, program, systemIP) {
    let cardColor = '#d3d3d3'; // Default to gray

    if (pidStates.some((state) => state === 0)) {
      cardColor = '#d3d3d3'; // Cinza para Clear
    } else {
      cardColor = '#ccffcc'; // Verde para Even ou Odd
    }

    // Verificar se algum PID tem lastChangeTime maior que 5 minutos e estado diferente de Clear
    if (shouldSetCardToRed(program, systemIP)) {
      cardColor = '#ffcccc'; // Vermelho para estado diferente de Clear por mais de 5 minutos
    }

    return cardColor;
  }

  function shouldSetCardToRed(program, systemIP) {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // Ajuste para 5 minutos (5 * 60 * 1000)
    let showWarning = false;

    const result = program.pids.some((pid) => {
      const pidState = lastScramblingState[`${systemIP}-${pid.pid}`];
      if (pidState && pidState.state !== 'Clear') {
        const lastChangeDate = new Date(pidState.time);
        if (lastChangeDate < fiveMinutesAgo) {
          showWarning = true;
          return true;
        }
      }
      return false;
    });

    return result;
  }

  function showScramblingWarning() {
    if (!alertEnabled) return; // Não mostra o alerta se estiver desabilitado

    const warningElement = document.getElementById('scrambling-warning');
    if (!warningElement) {
      const warningBanner = document.createElement('div');
      warningBanner.id = 'scrambling-warning';
      warningBanner.className = 'alert alert-danger fixed-top text-center';
      warningBanner.style.zIndex = '1100';
      warningBanner.innerHTML =
        'Atenção: Alguns serviços não estão trocando chaves há mais de 5 minutos! <button id="close-warning" class="btn-close" aria-label="Close"></button>';
      document.body.prepend(warningBanner);
      playWarningSound();

      document.getElementById('close-warning').addEventListener('click', () => {
        warningBanner.remove();
        stopWarningSound();
        // Desabilita os alertas até o usuário reativar
        alertEnabled = false;
        localStorage.setItem('alertEnabled', alertEnabled);
        updateAlertIcon();
      });
    }
  }

  function playWarningSound() {
    if (!window.warningAudio) {
      window.warningAudio = new Audio('sounds/alert.wav');
      window.warningAudio.loop = true;
    }
    if (window.warningAudio.paused) {
      window.warningAudio.play().catch((error) => {
        console.error('Erro ao tentar reproduzir o som de alerta:', error);
      });
    }
  }

  function stopWarningSound() {
    if (window.warningAudio) {
      window.warningAudio.pause();
      window.warningAudio.currentTime = 0;
    }
  }

  function displayData(
    scramblingData,
    psiData,
    statsData,
    outputElementId,
    systemIP
  ) {
    const outputContainer = document.getElementById(outputElementId);
    outputContainer.innerHTML = '';

    psiData.programs.forEach((program) => {
      let pidDetails = program.pids
        .map((pid) => {
          let scramblingState = statsData.PIDStats.find(
            (stat) => stat.pid === pid.pid
          );
          let state = 'Clear';
          let lastChangeTime = new Date();

          let pidStats = statsData.PIDStats.find(
            (stat) => stat.pid === pid.pid
          );
          let bitrate = pidStats
            ? (pidStats.bitrate / 100000).toFixed(2)
            : 'N/A';

          if (scramblingState) {
            if (scramblingState.scramblingstate === 3) {
              state = 'Odd';
            } else if (scramblingState.scramblingstate === 2) {
              state = 'Even';
            } else if (scramblingState.scramblingstate === 0) {
              state = 'Clear';
            }
          }

          if (!lastScramblingState[`${systemIP}-${pid.pid}`]) {
            lastScramblingState[`${systemIP}-${pid.pid}`] = {
              state: state,
              time: new Date().toISOString(),
            };
          } else if (
            lastScramblingState[`${systemIP}-${pid.pid}`].state !== state
          ) {
            lastScramblingState[`${systemIP}-${pid.pid}`] = {
              state: state,
              time: new Date().toISOString(),
            };
          }

          lastChangeTime = lastScramblingState[`${systemIP}-${pid.pid}`].time;

          // Salva o estado atualizado no localStorage
          saveScramblingState(systemIP);

          return `${pid.pid} 
                 ${pid.streamTypeDesc} 
                 ${bitrate} Mbps
                 ${new Date(lastChangeTime).toLocaleTimeString()}
                 <span class="badge ${
                   state === 'Odd'
                     ? 'text-bg-primary'
                     : state === 'Even'
                     ? 'text-bg-success'
                     : 'text-bg-light'
                 }">${state}</span>`;
        })
        .join('<br>');

      const serviceCard = document.createElement('div');
      serviceCard.className = 'card service-card';

      // Lógica para determinar a cor do card
      const pidStates = program.pids.map((pid) => {
        let pidStats = statsData.PIDStats.find((stat) => stat.pid === pid.pid);
        return pidStats ? pidStats.scramblingstate : 0;
      });

      let cardColor = determineCardColor(pidStates, program, systemIP);

      serviceCard.innerHTML = `<div class="card-body" style="background-color: ${cardColor};">
                          <h5 class="card-title">Programa ID: ${program.programId}</h5>
                          <h6 class="card-subtitle mb-2 text-muted">${program.serviceName}</h6>
                          <p class="card-text">
                              <strong>PIDs:</strong><br>
                              ${pidDetails}
                          </p>
                      </div>`;
      outputContainer.appendChild(serviceCard);
    });
  }

  function checkForLongScramblingState(psiData, systemIP) {
    if (!alertEnabled) return; // Não verifica se os alertas estão desabilitados

    const warningElement = document.getElementById('scrambling-warning');
    const showWarning = psiData.programs.some((program) =>
      shouldSetCardToRed(program, systemIP)
    );

    if (showWarning) {
      showScramblingWarning();
    } else if (warningElement) {
      warningElement.remove();
      stopWarningSound();
    }
  }

  function startAutoFetch() {
    if (Object.keys(muxes).length === 0) {
      alert(
        'Por favor, carregue um arquivo JSON de muxes antes de iniciar o monitoramento.'
      );
      return;
    }
    clearInterval(autoFetchInterval);
    const selectedSystem = document.getElementById('systemSelect').value;
    localStorage.setItem('selectedSystem', selectedSystem);
    updateSystemTitles(); // Atualiza os títulos dos sistemas
    fetchData(selectedSystem, 'services-primary', 'primary');
    fetchData(selectedSystem, 'services-backup', 'backup');
    updateAutoFetchInterval();
  }

  function updateAutoFetchInterval() {
    clearInterval(autoFetchInterval);
    const selectedInterval = document.getElementById(
      'updateIntervalSelect'
    ).value;
    localStorage.setItem('updateInterval', selectedInterval);
    autoFetchInterval = setInterval(() => {
      const selectedSystem = document.getElementById('systemSelect').value;
      fetchData(selectedSystem, 'services-primary', 'primary');
      fetchData(selectedSystem, 'services-backup', 'backup');
    }, selectedInterval);
  }

  function updateSystemTitles() {
    const selectedSystem = document.getElementById('systemSelect').value;
    document.getElementById('primary-system-title').textContent =
      selectedSystem;
    document.getElementById('backup-system-title').textContent = selectedSystem;
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const menuIcon = document.getElementById('menuIcon');

    // Altera o ícone durante a transição
    if (sidebar.classList.contains('collapsed')) {
      menuIcon.src = 'icons/menu-close.svg';
      sidebar.classList.remove('collapsed');
      mainContent.classList.remove('collapsed');
      mainContent.classList.add('expanded');
    } else {
      menuIcon.src = 'icons/menu-open.svg';
      sidebar.classList.add('collapsed');
      mainContent.classList.remove('expanded');
      mainContent.classList.add('collapsed');
    }
  }

  // Função para atualizar o ícone de alerta
  function updateAlertIcon() {
    if (alertEnabled) {
      alertIcon.src = 'icons/bell-alert.svg'; // Alerta ativo
    } else {
      alertIcon.src = 'icons/bell-cancel.svg'; // Alerta desabilitado
    }
  }

  // Função para alternar o estado do alerta
  function toggleAlertState() {
    alertEnabled = !alertEnabled;
    localStorage.setItem('alertEnabled', alertEnabled);
    updateAlertIcon();

    if (alertEnabled) {
      // Reativa a verificação de alertas
      const selectedSystem = document.getElementById('systemSelect').value;
      fetchData(selectedSystem, 'services-primary', 'primary');
      fetchData(selectedSystem, 'services-backup', 'backup');
    } else {
      // Remove o alerta e para o som se estiverem ativos
      const warningElement = document.getElementById('scrambling-warning');
      if (warningElement) {
        warningElement.remove();
        stopWarningSound();
      }
    }
  }

  // Adiciona o listener de clique ao botão
  document
    .getElementById('toggleSidebar')
    .addEventListener('click', toggleSidebar);

  // Adiciona o listener de clique ao botão
  document
    .getElementById('updateIntervalSelect')
    .addEventListener('click', updateAutoFetchInterval);

  // Adiciona um listener de clique ao botão de configuração
  document
    .getElementById('configButton')
    .addEventListener('click', function () {
      window.location.href = 'config.html';
    });

  // Adiciona um listener de clique ao ícone de alerta
  alertIcon.addEventListener('click', toggleAlertState);

  window.onload = function () {
    // Carregar configurações salvas do localStorage
    const savedMuxes = localStorage.getItem('muxes');
    if (savedMuxes) {
      muxes = JSON.parse(savedMuxes);
      populateSystemSelect(muxes);
    }

    const savedInterval = localStorage.getItem('updateInterval');
    if (savedInterval) {
      document.getElementById('updateIntervalSelect').value = savedInterval;
    }

    // Carregar o estado do alerta do localStorage
    const savedAlertEnabled = localStorage.getItem('alertEnabled');
    alertEnabled = savedAlertEnabled !== 'false'; // Converte para booleano
    updateAlertIcon(); // Atualiza o ícone com base no estado atual

    startAutoFetch();

    // Adiciona o listener de mudança ao select de sistema
    document.getElementById('systemSelect').addEventListener('change', () => {
      const selectedSystem = document.getElementById('systemSelect').value;
      loadScramblingState(selectedSystem);
      startAutoFetch();
    });
  };
});
