// ARQUIVO: public/script.js
const app = {
    user: null,
    chart: null,
    orcamentoChart: null,

    init: () => {
        app.showLogin();

        const loginForm = document.getElementById('loginForm');
        if(loginForm) loginForm.addEventListener('submit', app.login);

        const btnLogout = document.getElementById('btn-logout');
        if(btnLogout) btnLogout.addEventListener('click', app.logout);

        const formCadastro = document.getElementById('form-cadastro');
        if(formCadastro) formCadastro.addEventListener('submit', app.cadastrarUsuario);
        
        const formReset = document.getElementById('form-reset');
        if(formReset) formReset.addEventListener('submit', app.confirmarResetSenha);

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.id === 'btn-logout' || btn.closest('#btn-logout')) return;
                const target = btn.dataset.target;
                if (target) app.switchTab(target);
            });
        });
    },

    setLoading: (show) => {
        const el = document.getElementById('loader');
        if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
    },

    showLogin: () => {
        const viewLogin = document.getElementById('view-login');
        const viewApp = document.getElementById('view-app');
        const modalReset = document.getElementById('modal-reset');
        
        if(viewLogin) viewLogin.classList.remove('hidden');
        if(viewApp) viewApp.classList.add('hidden');
        if(modalReset) modalReset.classList.add('hidden');
        app.user = null;
    },

    login: async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const err = document.getElementById('msg-error');
        
        app.setLoading(true);
        err.innerText = "";
        try {
            const res = await fetch('/api/login', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) {
                app.user = data.user;
                document.getElementById('password').value = "";
                if (app.user.Senha_prov) {
                    app.setLoading(false);
                    document.getElementById('view-login').classList.add('hidden');
                    document.getElementById('modal-reset').classList.remove('hidden'); 
                } else { app.showApp(); }
            } else { err.innerText = data.message; }
        } catch (e) { err.innerText = "Erro de conexão."; } 
        finally { if (!app.user || !app.user.Senha_prov) app.setLoading(false); }
    },

    confirmarResetSenha: async (e) => {
        e.preventDefault();
        const s1 = document.getElementById('nova-senha').value;
        const s2 = document.getElementById('confirma-senha').value;
        const msg = document.getElementById('msg-reset');
        if (s1 !== s2) { msg.innerText = "As senhas não coincidem!"; return; }

        app.setLoading(true);
        try {
            const res = await fetch('/api/definir-senha', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: app.user.Email, novaSenha: s1 })
            });
            const data = await res.json();
            if (data.success) {
                alert("Senha atualizada!");
                document.getElementById('modal-reset').classList.add('hidden');
                app.user.Senha_prov = null; app.showApp();
            } else { msg.innerText = data.message; }
        } catch (err) { msg.innerText = "Erro ao atualizar senha."; } 
        finally { app.setLoading(false); }
    },

    showApp: () => {
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('modal-reset').classList.add('hidden');
        document.getElementById('view-app').classList.remove('hidden');
        
        const nome = app.user.Nome ? app.user.Nome.split(' ')[0] : 'User';
        const depto = app.user.Departamento || 'Geral';
        const textoUsuario = `${nome} | ${depto}`;

        const elDash = document.getElementById('user-info');
        if(elDash) {
            elDash.innerText = textoUsuario;
            document.getElementById('user-avatar').innerText = nome.charAt(0).toUpperCase();
        }

        const elOrc = document.getElementById('user-info-orcamento');
        if(elOrc) {
            elOrc.innerText = textoUsuario;
        }

        const isAdmin = (app.user.Role === 'admin');

        document.querySelectorAll('.restricted').forEach(el => {
            el.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
        });

        const btnDashboard = document.querySelector('.nav-btn[data-target="dashboard"]');
        if (btnDashboard) {
            btnDashboard.style.display = isAdmin ? 'flex' : 'none';
        }

        if(isAdmin) app.loadDepartamentos();
        
        if (isAdmin) {
            app.switchTab('dashboard');
            setTimeout(() => app.fetchData(), 100);
        } else {
            app.switchTab('reports');
        }
    },

    logout: () => { app.user = null; app.showLogin(); },

    switchTab: (tab) => {
        document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
        
        const targetSection = document.getElementById(`page-${tab}`);
        if(targetSection) targetSection.classList.add('active');
        
        const btn = document.querySelector(`.nav-btn[data-target="${tab}"]`);
        if(btn) btn.classList.add('active');

        // Limpa gráficos anteriores para evitar conflitos de renderização
        if (tab !== 'dashboard' && app.chart) {
            app.chart.destroy();
            app.chart = null;
        }
        if (tab !== 'reports' && app.orcamentoChart) {
            app.orcamentoChart.destroy();
            app.orcamentoChart = null;
        }

        if (tab === 'reports') {
            app.loadOrcamento();
        } else if (tab === 'dashboard') {
            app.fetchData();
        }
    },

    loadOrcamento: async () => {
        app.setLoading(true);
        const tbody = document.querySelector('#orcamento-table tbody');
        const kpiContainer = document.getElementById('kpi-orcamento-container');

        if(tbody) tbody.innerHTML = '<tr><td colspan="49" style="text-align:center; padding:20px;">Carregando dados orçamentários...</td></tr>';
        if(kpiContainer) kpiContainer.innerHTML = ''; 

        try {
            const email = app.user.Email;
            const res = await fetch(`/api/orcamento?email=${encodeURIComponent(email)}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            
            app.renderOrcamentoTable(data);
            app.renderOrcamentoKPIs(data);
            app.renderOrcamentoChart(data);

        } catch (err) {
            console.error(err);
            if(tbody) tbody.innerHTML = `<tr><td colspan="49" style="text-align:center; color:red; padding:20px;">Erro ao carregar orçamento: ${err.message}</td></tr>`;
        } finally {
            app.setLoading(false);
        }
    },

    renderOrcamentoKPIs: (data) => {
        const container = document.getElementById('kpi-orcamento-container');
        if (!container || !data) return;

        const keys = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
        const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const hoje = new Date();
        const mesIndex = hoje.getMonth(); 
        const keyMes = keys[mesIndex];
        const nomeMes = mesesNomes[mesIndex];

        let totalOrcado = 0;
        let totalRealizado = 0;

        data.forEach(grupo => {
            if (grupo.dados && grupo.dados[keyMes]) {
                totalOrcado += Math.abs(grupo.dados[keyMes].orcado || 0);
                totalRealizado += Math.abs(grupo.dados[keyMes].realizado || 0);
            }
        });

        const diferencaValor = totalOrcado - totalRealizado; 
        
        let diferencaPerc = 0;
        if (totalOrcado !== 0) {
            diferencaPerc = (diferencaValor / totalOrcado) * 100;
        } else if (totalRealizado > 0) {
            diferencaPerc = -100; 
        }

        const fmt = v => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v);
        const fmtPerc = v => new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1}).format(v) + '%';
        const corDif = diferencaValor >= 0 ? 'text-green' : 'text-red';

        const mkCard = (label, value, cssClass = '') => `
            <div class="card">
                <div class="card-title">${label}</div>
                <div class="card-value ${cssClass}">${value}</div>
            </div>
        `;

        container.innerHTML = 
            mkCard(`Orçado (${nomeMes})`, fmt(totalOrcado), 'col-orc') +
            mkCard(`Realizado (${nomeMes})`, fmt(totalRealizado), 'col-real') +
            mkCard(`Diferença R$`, fmt(diferencaValor), corDif) +
            mkCard(`Diferença %`, fmtPerc(diferencaPerc), corDif);
    },

    // --- GRÁFICO DE ORÇAMENTO (AJUSTE DEFINITIVO DE VISIBILIDADE) ---
    renderOrcamentoChart: (data) => {
        const canvas = document.getElementById('orcamentoChart');
        if(!canvas) return;
        if (typeof Chart === 'undefined') return;

        // Limpeza segura
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        if (app.orcamentoChart) { app.orcamentoChart.destroy(); app.orcamentoChart = null; }

        const mesesKeys = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
        const labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        
        const arrOrcado = new Array(12).fill(0);
        const arrRealizado = new Array(12).fill(0);

        data.forEach(grupo => {
            mesesKeys.forEach((key, idx) => {
                if(grupo.dados && grupo.dados[key]) {
                    const vOrc = Math.abs(grupo.dados[key].orcado || 0);
                    const vReal = Math.abs(grupo.dados[key].realizado || 0);
                    arrOrcado[idx] += vOrc;
                    arrRealizado[idx] += vReal;
                }
            });
        });

        if (typeof ChartDataLabels !== 'undefined') { try { Chart.register(ChartDataLabels); } catch(e){} }

        const ctx = canvas.getContext('2d');

        const gradientReal = ctx.createLinearGradient(0, 0, 0, 400);
        gradientReal.addColorStop(0, 'rgba(37, 99, 235, 0.4)');
        gradientReal.addColorStop(1, 'rgba(37, 99, 235, 0.05)');

        const gradientOrc = ctx.createLinearGradient(0, 0, 0, 400);
        gradientOrc.addColorStop(0, 'rgba(121, 182, 97, 0.46)');
        gradientOrc.addColorStop(1, 'rgba(95, 145, 80, 0.53)');

        app.orcamentoChart = new Chart(ctx, {
            type: 'line', 
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Orçado',
                        data: arrOrcado,
                        borderColor: '#189629ff', 
                        backgroundColor: gradientOrc, 
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        fill: true, 
                        order: 2,
                        clip: false // Permite rótulo vazar
                    },
                    {
                        label: 'Realizado',
                        data: arrRealizado,
                        borderColor: '#2563eb', 
                        backgroundColor: gradientReal, 
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#2563eb',
                        pointBorderWidth: 2,
                        fill: true, 
                        order: 1,
                        clip: false // Permite rótulo vazar
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    // Padding agressivo para evitar qualquer corte
                    padding: { top: 100, right: 60, left: 60, bottom: 20 }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { 
                        position: 'top', 
                        labels: { usePointStyle: true, boxWidth: 8, padding: 20, font: {family: "'Inter', sans-serif"} } 
                    },
                    tooltip: { enabled: false }, 
                    datalabels: {
                        display: true, 
                        clip: false, 
                        align: 'top', 
                        anchor: 'end', 
                        offset: 4,
                        color: '#000000', 
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) {
                            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        // 'Grace' adiciona respiro extra no topo do eixo Y
                        grace: '50%',
                        grid: { borderDash: [5, 5], color: '#f3f4f6' },
                        ticks: {
                            color: '#6b7280',
                            font: { size: 11 },
                            callback: function(value) {
                                return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: "compact" }).format(value);
                            }
                        }
                    },
                    x: { 
                        // OFFSET: TRUE (Isso afasta o primeiro ponto do eixo Y e o último da borda direita)
                        offset: true,
                        grid: { display: false },
                        ticks: { color: '#374151', font: { weight: '600' } }
                    }
                }
            }
        });
    },

    renderTable: (rows) => {
        const fmt = v => v ? new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v) : '-';
        const tbody = document.querySelector('#finance-table tbody');
        if(!tbody) return;
        if(!rows || rows.length===0) { tbody.innerHTML='<tr><td colspan="13">Sem dados</td></tr>'; return; }

        let html = '';
        rows.forEach((row, idx1) => {
            const idNivel1 = `L1-${idx1}`; 
            let trStyle = ''; 
            let tdClass = ''; 
            let icon = '';
            let clickAction = '';
            let rowClass = '';

            if (row.tipo === 'saldo' || row.tipo === 'info') {
                trStyle = 'background-color: #eff6ff; font-weight: 800; color: #1e3a8a; border-top: 2px solid #bfdbfe;';
            } else if (row.tipo === 'grupo') {
                rowClass = 'hover-row';
                trStyle = 'font-weight: 600; cursor: pointer; background-color: #fff;'; 
                icon = '<i class="fa-solid fa-chevron-right toggle-icon"></i> ';
                clickAction = `onclick="app.toggleGroup('${idNivel1}', this)"`;
                
                if (row.conta.includes('Entradas')) tdClass = 'text-green';
                if (row.conta.includes('Saídas')) tdClass = 'text-red';
            }

            html += `
                <tr style="${trStyle}" class="${rowClass}" ${clickAction}>
                    <td style="text-align:left; padding-left:10px;">${icon}<span class="${tdClass}">${row.conta}</span></td>
                    <td class="${tdClass}">${fmt(row.jan)}</td>
                    <td class="${tdClass}">${fmt(row.fev)}</td>
                    <td class="${tdClass}">${fmt(row.mar)}</td>
                    <td class="${tdClass}">${fmt(row.abr)}</td>
                    <td class="${tdClass}">${fmt(row.mai)}</td>
                    <td class="${tdClass}">${fmt(row.jun)}</td>
                    <td class="${tdClass}">${fmt(row.jul)}</td>
                    <td class="${tdClass}">${fmt(row.ago)}</td>
                    <td class="${tdClass}">${fmt(row.set)}</td>
                    <td class="${tdClass}">${fmt(row.out)}</td>
                    <td class="${tdClass}">${fmt(row.nov)}</td>
                    <td class="${tdClass}">${fmt(row.dez)}</td>
                </tr>
            `;

            if (row.detalhes && row.detalhes.length > 0) {
                row.detalhes.forEach((subgrupo, idx2) => {
                    const idNivel2 = `L2-${idx1}-${idx2}`; 
                    html += `
                        <tr class="child-row hidden pai-${idNivel1} hover-row" 
                            onclick="app.toggleSubGroup('${idNivel2}', this)" 
                            style="cursor: pointer;">
                            <td style="text-align:left; padding-left: 25px; font-weight: 600;">
                                <i class="fa-solid fa-chevron-right toggle-icon" style="font-size: 0.8em; margin-right: 5px;"></i>
                                ${subgrupo.conta}
                            </td>
                            <td>${fmt(subgrupo.jan)}</td><td>${fmt(subgrupo.fev)}</td><td>${fmt(subgrupo.mar)}</td>
                            <td>${fmt(subgrupo.abr)}</td><td>${fmt(subgrupo.mai)}</td><td>${fmt(subgrupo.jun)}</td>
                            <td>${fmt(subgrupo.jul)}</td><td>${fmt(subgrupo.ago)}</td><td>${fmt(subgrupo.set)}</td>
                            <td>${fmt(subgrupo.out)}</td><td>${fmt(subgrupo.nov)}</td><td>${fmt(subgrupo.dez)}</td>
                        </tr>
                    `;
                    if (subgrupo.detalhes && subgrupo.detalhes.length > 0) {
                        subgrupo.detalhes.forEach(item => {
                            html += `
                                <tr class="child-row hidden pai-${idNivel2} avo-${idNivel1}">
                                    <td style="text-align:left; padding-left: 50px; color: #555;">${item.conta}</td>
                                    <td>${fmt(item.jan)}</td><td>${fmt(item.fev)}</td><td>${fmt(item.mar)}</td>
                                    <td>${fmt(item.abr)}</td><td>${fmt(item.mai)}</td><td>${fmt(item.jun)}</td>
                                    <td>${fmt(item.jul)}</td><td>${fmt(item.ago)}</td><td>${fmt(item.set)}</td>
                                    <td>${fmt(item.out)}</td><td>${fmt(item.nov)}</td><td>${fmt(item.dez)}</td>
                                </tr>
                            `;
                        });
                    }
                });
            }
        });
        tbody.innerHTML = html;
    },

    renderOrcamentoTable: (data) => {
        const tbody = document.querySelector('#orcamento-table tbody');
        if(!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="49" style="text-align:center; padding:20px;">Nenhum registro encontrado para seu departamento.</td></tr>';
            return;
        }

        const fmt = v => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        const fmtPerc = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v) + '%';
        const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

        let html = '';

        data.forEach((grupo, idx) => {
            const idGrupo = `orc-g-${idx}`;
            
            let colsHtmlGrupo = '';
            meses.forEach(m => {
                const vals = grupo.dados[m];
                let clsDif = vals.diferenca < 0 ? 'text-red' : (vals.diferenca > 0 ? 'text-green' : '');
                let difPerc = 0;
                if(vals.orcado !== 0) difPerc = (vals.diferenca / vals.orcado) * 100;
                else if(vals.realizado > 0) difPerc = -100; 

                colsHtmlGrupo += `
                    <td class="col-orc" style="font-weight:bold;">${fmt(vals.orcado)}</td>
                    <td class="col-real" style="font-weight:bold;">${fmt(vals.realizado)}</td>
                    <td class="col-dif ${clsDif}" style="font-weight:bold;">${fmt(vals.diferenca)}</td>
                    <td class="col-perc ${clsDif}">${fmtPerc(difPerc)}</td>
                `;
            });

            html += `
                <tr class="hover-row" onclick="app.toggleGroup('${idGrupo}', this)" style="cursor: pointer; background-color: #f8fafc;">
                    <td class="sticky-col" style="font-weight: 700; color: #1e3a8a; background-color: #f8fafc !important;">
                        <i class="fa-solid fa-chevron-right toggle-icon"></i> ${grupo.conta}
                    </td>
                    ${colsHtmlGrupo}
                </tr>
            `;

            if(grupo.detalhes && grupo.detalhes.length > 0) {
                grupo.detalhes.forEach(item => {
                    let colsHtmlItem = '';
                    meses.forEach(m => {
                        const vals = item.dados[m];
                        let clsDif = vals.diferenca < 0 ? 'text-red' : (vals.diferenca > 0 ? 'text-green' : '');
                        let difPerc = 0;
                        if(vals.orcado !== 0) difPerc = (vals.diferenca / vals.orcado) * 100;
                        else if(vals.realizado > 0) difPerc = -100;

                        colsHtmlItem += `
                            <td class="col-orc" style="background-color:#fff;">${fmt(vals.orcado)}</td>
                            <td class="col-real" style="background-color:#f9fafb;">${fmt(vals.realizado)}</td>
                            <td class="col-dif ${clsDif}">${fmt(vals.diferenca)}</td>
                            <td class="col-perc ${clsDif}">${fmtPerc(difPerc)}</td>
                        `;
                    });

                    html += `
                        <tr class="child-row hidden pai-${idGrupo}">
                            <td class="sticky-col" style="padding-left: 30px !important; color: #4b5563;">
                                ${item.conta}
                            </td>
                            ${colsHtmlItem}
                        </tr>
                    `;
                });
            }
        });

        tbody.innerHTML = html;
    },

    loadDepartamentos: async () => {
        try {
            const res = await fetch('/api/departamentos');
            const deps = await res.json();
            const select = document.getElementById('cad-departamento');
            if(select) {
                select.innerHTML = '<option value="">Selecione...</option>';
                deps.forEach(d => { select.innerHTML += `<option value="${d.Id_dep}">${d.Nome_dep}</option>`; });
            }
        } catch (err) { console.error(err); }
    },

    cadastrarUsuario: async (e) => {
        e.preventDefault();
        const msg = document.getElementById('cad-mensagem');
        msg.innerText = "Enviando..."; msg.style.color = "blue";
        
        const prefixo = document.getElementById('cad-email-prefix').value.trim();
        const emailFinal = `${prefixo}@objetivaatacadista.com.br`;

        const dados = {
            nome: document.getElementById('cad-nome').value,
            email: emailFinal,
            departamentoId: document.getElementById('cad-departamento').value,
            role: document.getElementById('cad-role').value,
            nivel: document.getElementById('cad-nivel').value 
        };
        
        try {
            const res = await fetch('/api/usuarios', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const result = await res.json();
            if (result.success) {
                msg.innerText = "✅ " + result.message; msg.style.color = "green";
                document.getElementById('form-cadastro').reset();
                if(document.getElementById('cad-nivel')) document.getElementById('cad-nivel').value = '1';
            } else { msg.innerText = "❌ " + result.message; msg.style.color = "red"; }
        } catch (err) { msg.innerText = "Erro ao conectar."; msg.style.color = "red"; }
    },

    fetchData: async () => {
        app.setLoading(true);
        try {
            const res = await fetch('/api/dashboard');
            const data = await res.json();
            if(data.error) throw new Error(data.error);
            app.renderKPIs(data.cards);
            app.renderTable(data.tabela); 
            setTimeout(() => app.renderChart(data.grafico), 50);
        } catch (err) { console.error(err); } 
        finally { app.setLoading(false); }
    },

    renderKPIs: (c) => {
        const fmt = v => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v);
        const ct = document.getElementById('kpi-container');
        if(!ct) return;
        const mk = (l, v, cl) => `<div class="card"><div class="card-title">${l}</div><div class="card-value ${cl}">${fmt(v)}</div></div>`;
        const labelResultado = c.deficitSuperavit >= 0 ? 'Superávit' : 'Déficit';
        ct.innerHTML = mk('Saldo Inicial',c.saldoInicial,'') + 
                       mk('Entradas',c.entrada,'text-green') + 
                       mk('Saídas',c.saida,'text-red') + 
                       mk(labelResultado, c.deficitSuperavit, c.deficitSuperavit>=0?'text-green':'text-red') + 
                       mk('Saldo Final',c.saldoFinal,'bold');
    },

    toggleGroup: (idPai, el) => {
        const filhos = document.getElementsByClassName(`pai-${idPai}`);
        if(filhos.length === 0) return;

        const estaEscondido = filhos[0].classList.contains('hidden');
        const icon = el.querySelector('.toggle-icon');
        if(icon) icon.style.transform = estaEscondido ? 'rotate(90deg)' : 'rotate(0deg)';

        Array.from(filhos).forEach(row => {
            row.classList.toggle('hidden', !estaEscondido);
        });
        
        if (!estaEscondido) { 
            const netos = document.getElementsByClassName(`avo-${idPai}`);
            if (netos.length > 0) {
                Array.from(netos).forEach(neto => neto.classList.add('hidden'));
                Array.from(filhos).forEach(rowL2 => {
                    const iconL2 = rowL2.querySelector('.toggle-icon');
                    if(iconL2) iconL2.style.transform = 'rotate(0deg)';
                });
            }
        }
    },

    toggleSubGroup: (idL2, el) => {
        const filhosNivel3 = document.getElementsByClassName(`pai-${idL2}`);
        if(filhosNivel3.length === 0) return;
        const estaEscondido = filhosNivel3[0].classList.contains('hidden');
        const icon = el.querySelector('.toggle-icon');
        if(icon) icon.style.transform = estaEscondido ? 'rotate(90deg)' : 'rotate(0deg)';
        Array.from(filhosNivel3).forEach(row => { row.classList.toggle('hidden', !estaEscondido); });
    },

    renderChart: (d) => {
        const canvas = document.getElementById('mainChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if (typeof Chart === 'undefined') return;

        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        if (app.chart) { app.chart.destroy(); app.chart = null; }

        if (typeof ChartDataLabels !== 'undefined') { try { Chart.register(ChartDataLabels); } catch(e){} }

        function getGradient(context, isBackground) {
            const chart = context.chart;
            const {ctx, chartArea, scales} = chart;
            if (!chartArea) return isBackground ? 'rgba(16, 185, 129, 0.1)' : '#10b981';
            const yAxis = scales.y;
            const yZero = yAxis.getPixelForValue(0); 
            const height = chartArea.bottom - chartArea.top;
            let offset = (chartArea.bottom - yZero) / height;
            offset = Math.min(Math.max(offset, 0), 1);
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            if (isBackground) {
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');     
                gradient.addColorStop(offset, 'rgba(239, 68, 68, 0.05)'); 
                gradient.addColorStop(offset, 'rgba(16, 185, 129, 0.05)'); 
                gradient.addColorStop(1, 'rgba(16, 185, 129, 0.4)');    
            } else {
                gradient.addColorStop(0, '#ef4444');      
                gradient.addColorStop(offset, '#ef4444'); 
                gradient.addColorStop(offset, '#10b981'); 
                gradient.addColorStop(1, '#10b981');      
            }
            return gradient;
        }

        app.chart = new Chart(ctx, {
            type: 'line',
            data: { 
                labels: d.labels, 
                datasets: [{
                    label: 'Fluxo', data: d.data, fill: true, tension: 0.4, borderWidth: 2,
                    pointBackgroundColor: '#fff', pointBorderWidth: 2, pointRadius: 5, 
                    borderColor: function(c) { return getGradient(c, false); },
                    backgroundColor: function(c) { return getGradient(c, true); },
                    pointBorderColor: function(c) { return c.raw >= 0 ? '#10b981' : '#ef4444'; }
                }] 
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                layout: { padding: { top: 30, bottom: 10, left: 20, right: 30 } },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false }, tooltip: { enabled: false }, 
                    datalabels: {
                        display: function(context) { return window.innerWidth > 768; },
                        align: 'top', anchor: 'end', offset: 8, clamp: true,       
                        color: function(context) { return context.dataset.data[context.dataIndex] >= 0 ? '#059669' : '#dc2626'; },
                        font: { weight: 'bold', size: 12 },
                        formatter: function(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
                    }
                }, 
                scales: {
                    x: { grid: { display: false }, offset: true }, 
                    y: { 
                        grid: { borderDash: [5,5] }, grace: '10%',
                        ticks: { padding: 10, callback: function(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); } }
                    }
                } 
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', app.init);