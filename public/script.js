// ARQUIVO: public/script.js
const app = {
    user: null,
    chart: null,

    init: () => {
        // --- MUDANÇA: REMOVIDO AUTO-LOGIN ---
        // Sempre força a tela de login ao iniciar
        app.showLogin();

        // Event Listeners
        document.getElementById('loginForm').addEventListener('submit', app.login);
        document.getElementById('btn-logout').addEventListener('click', app.logout);
        document.querySelectorAll('.nav-btn').forEach(btn => 
            btn.addEventListener('click', () => app.switchTab(btn.dataset.target))
        );
    },

    setLoading: (show) => {
        const el = document.getElementById('loader');
        if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
    },

    showLogin: () => {
        document.getElementById('view-login').classList.remove('hidden');
        document.getElementById('view-app').classList.add('hidden');
        // Limpa qualquer dado de usuário anterior da memória
        app.user = null;
    },

    showApp: () => {
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('view-app').classList.remove('hidden');
        
        // Preenche dados do usuário na tela
        document.getElementById('user-name').innerText = app.user.Nome ? app.user.Nome.split(' ')[0] : 'Usuário';
        document.getElementById('user-avatar').innerText = app.user.Nome ? app.user.Nome.charAt(0) : 'U';

        // Aplica restrições de segurança (Se não for admin, esconde configurações)
        if(app.user.Role !== 'admin') {
            document.querySelectorAll('.restricted').forEach(e => e.style.display = 'none');
        } else {
            // Garante que mostre caso tenha logado antes com usuário comum
            document.querySelectorAll('.restricted').forEach(e => e.style.display = 'block');
        }

        app.fetchData();
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
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.success) {
                app.user = data.user;
                // --- MUDANÇA: NÃO SALVAMOS MAIS NO LOCALSTORAGE ---
                // localStorage.setItem('finance_session', JSON.stringify(data.user)); 
                
                // Limpa campos de senha por segurança
                document.getElementById('password').value = "";
                app.showApp();
            } else {
                err.innerText = data.message;
            }
        } catch (e) {
            console.error(e);
            err.innerText = "Erro ao conectar com o servidor.";
        } finally {
            app.setLoading(false);
        }
    },

    logout: () => {
        // Apenas volta para o login (dados já não são persistidos)
        app.user = null;
        app.showLogin();
    },

    switchTab: (tab) => {
        document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${tab}`).classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-btn[data-target="${tab}"]`).classList.add('active');
    },

    fetchData: async () => {
        app.setLoading(true);
        try {
            const res = await fetch('/api/dashboard');
            const data = await res.json();
            
            if(data.error) throw new Error(data.error);

            app.renderKPIs(data.cards);
            app.renderTable(data.tabela);
            app.renderChart(data.grafico);
        } catch (err) {
            console.error(err);
        } finally {
            app.setLoading(false);
        }
    },

    renderKPIs: (c) => {
        const fmt = v => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v);
        const ct = document.getElementById('kpi-container');
        
        // Função auxiliar para criar o HTML do card
        const mk = (label, val, cl) => `
            <div class="card">
                <div class="card-title">${label}</div>
                <div class="card-value ${cl}">${fmt(val)}</div>
            </div>`;
        
        ct.innerHTML = 
            mk('Saldo Inicial', c.saldoInicial, '') +
            mk('Entradas', c.entrada, 'text-green') +
            mk('Saídas', c.saida, 'text-red') +
            mk('Resultado', c.deficitSuperavit, c.deficitSuperavit >= 0 ? 'text-green' : 'text-red') +
            mk('Saldo Final', c.saldoFinal, 'bold');
    },

    renderTable: (rows) => {
        const fmt = v => v ? new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v) : '-';
        const tbody = document.querySelector('#finance-table tbody');
        
        if(!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:20px;">Sem dados disponíveis</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.conta}</td>
                <td>${fmt(r.jan)}</td><td>${fmt(r.fev)}</td><td>${fmt(r.mar)}</td>
                <td>${fmt(r.abr)}</td><td>${fmt(r.mai)}</td><td>${fmt(r.jun)}</td>
                <td>${fmt(r.jul)}</td><td>${fmt(r.ago)}</td><td>${fmt(r.set)}</td>
                <td>${fmt(r.out)}</td><td>${fmt(r.nov)}</td><td>${fmt(r.dez)}</td>
            </tr>`).join('');
    },

    renderChart: (d) => {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if(app.chart) app.chart.destroy();
        app.chart = new Chart(ctx, {
            type: 'line',
            data: { 
                labels: d.labels, 
                datasets: [{ 
                    label:'Fluxo Líquido', 
                    data:d.data, 
                    borderColor:'#2563eb', 
                    backgroundColor:'rgba(37,99,235,0.1)', 
                    fill:true, 
                    tension:0.4 
                }] 
            },
            options: { 
                responsive:true, 
                maintainAspectRatio:false, 
                plugins:{legend:{display:false}}, 
                scales:{
                    x:{grid:{display:false}},
                    y:{grid:{borderDash:[5,5]}}
                } 
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', app.init);