import { createClient } from '@supabase/supabase-js';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: window.sessionStorage,
        autoRefreshToken: true,
        persistSession: true
    }
});

const state = {
    user: null,
    payslips: [],
    documentSubscription: null,
    admin: {
        totalEmployees: '0',
        employeesTrend: '+0%',
        recentUploads: '0',
        uploadsTrend: '+0%',
        pendingDocs: '0',
        pendingTrend: '0%',
        storage: '0%',
        storageUsed: '0 GB',
        storageTotal: '1 GB',
        activities: [],
        analytics: {
            uploads: [0, 0, 0, 0, 0, 0],
            months: ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN']
        }
    },
    currentPage: 'login',
    sidebarOpen: false
};

// --- AUTH & DATA LOGIC ---

async function fetchUserData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error) {
        console.warn('Profile not found or error, using default:', error.message);
        // Return user with default profile instead of null to allow app access
        return {
            ...session.user,
            profile: {
                full_name: session.user.email.split('@')[0],
                role: 'employee'
            }
        };
    }

    return { ...session.user, profile };
}

async function fetchDocuments() {
    if (!state.user) return [];
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('profile_id', state.user.id)
        .order('reference_month', { ascending: false });

    if (error) {
        console.error('Error fetching documents:', error);
        return [];
    }
    return data || [];
}

async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        showToast('Erro no login: ' + error.message, 'error');
        return;
    }

    // Explicitly navigate to dashboard on success
    state.currentPage = 'dashboard';
    window.history.pushState({}, '', '/dashboard');
    await initApp();
}

async function signup(email, password, fullName, cpf) {
    const role = 'employee';
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        showToast('Erro no cadastro: ' + error.message, 'error');
        return;
    }

    if (data.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([
                { id: data.user.id, full_name: fullName, cpf: cpf.replace(/\D/g, ''), role: role, department: 'Geral' }
            ]);

        if (profileError) {
            console.error('Error creating profile:', profileError);
            showToast('Aviso: Sua conta foi criada, mas houve um erro ao salvar seu cargo (role).', 'info');
        }

        // Check if session exists (email confirmation is off in Supabase)
        if (data.session) {
            showToast('Cadastro realizado com sucesso! Bem-vindo.', 'success');
            state.user = { ...data.user, profile: { full_name: fullName, cpf: cpf.replace(/\D/g, ''), role: role } };
            state.currentPage = 'dashboard';
            window.history.pushState({}, '', '/dashboard');
            await initApp();
        } else {
            showToast('Cadastro realizado! Verifique seu e-mail ou tente logar.', 'info');
            state.currentPage = 'login';
            render();
        }
    }
}

async function logout() {
    if (state.documentSubscription) {
        state.documentSubscription.unsubscribe();
        state.documentSubscription = null;
    }
    await supabase.auth.signOut();
    state.user = null;
    state.payslips = [];
    state.currentPage = 'login';
    render();
}

async function initApp() {
    const userWithProfile = await fetchUserData();
    if (userWithProfile) {
        state.user = userWithProfile;
        state.payslips = await fetchDocuments();
        setupRealtime(); // Setup realtime after user is identified
        const path = window.location.pathname.substring(1);
        state.currentPage = (path && path !== 'login' && path !== 'signup') ? path : 'dashboard';
    } else {
        const path = window.location.pathname.substring(1);
        state.currentPage = path === 'signup' ? 'signup' : 'login';
    }
    render();
}

function setupRealtime() {
    if (state.documentSubscription) return;
    if (!state.user) return;

    state.documentSubscription = supabase
        .channel('documents-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'documents',
                filter: `profile_id=eq.${state.user.id}`
            },
            async (payload) => {
                console.log('Realtime update received:', payload);
                state.payslips = await fetchDocuments();
                render();
            }
        )
        .subscribe();
}

// Router
function initRouter() {
    window.onpopstate = () => initApp();
}
initRouter();

async function navigate(page) {
    state.currentPage = page;
    state.sidebarOpen = false; // Close sidebar on navigation
    
    // Refresh documents when navigating to list or dashboard to ensure data is fresh
    if (page === 'list' || page === 'dashboard') {
        state.payslips = await fetchDocuments();
    }
    
    const path = (page === 'login' || page === 'signup') ? `/${page}` : `/${page}`;
    window.history.pushState({}, '', page === 'login' ? '/' : path);
    render();
}

// --- UI HELPERS (TOASTS & MODALS) ---

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };

    toast.innerHTML = `
        <div class="toast-icon" style="color: var(--${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'})">
            <i data-lucide="${icons[type] || 'info'}"></i>
        </div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showConfirm(title, message, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-icon-container" style="background: #eff6ff; color: var(--primary);">
                        <i data-lucide="help-circle"></i>
                    </div>
                    <h2 class="modal-title">${title}</h2>
                </div>
                <div class="modal-body">${message}</div>
                <div class="modal-footer">
                    <button class="btn btn-outline" id="modal-cancel">${cancelText}</button>
                    <button class="btn btn-primary" id="modal-confirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        lucide.createIcons();

        const cleanup = (value) => {
            overlay.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => {
                overlay.remove();
                resolve(value);
            }, 200);
        };

        overlay.querySelector('#modal-cancel').onclick = () => cleanup(false);
        overlay.querySelector('#modal-confirm').onclick = () => cleanup(true);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
}

window.showToast = showToast;
window.showConfirm = showConfirm;

// Expose functions to global scope for HTML event handlers
window.navigate = navigate;
window.login = login;
window.signup = signup;
window.logout = logout;
window.toggleSidebar = () => {
    state.sidebarOpen = !state.sidebarOpen;
    render();
};

async function viewDocument(fileUrlOrPath) {
    if (!fileUrlOrPath) return showToast('Arquivo não encontrado.', 'error');

    // Extract path if it's a full URL
    let path = fileUrlOrPath;
    if (fileUrlOrPath.includes('/public/holerites/')) {
        path = fileUrlOrPath.split('/public/holerites/')[1];
    }

    try {
        const { data, error } = await supabase.storage
            .from('holerites')
            .createSignedUrl(path, 60);

        if (error) throw error;
        window.open(data.signedUrl, '_blank');
    } catch (err) {
        console.error('Error creating signed URL:', err);
        showToast('Erro ao carregar o arquivo.', 'error');
    }
}

window.viewDocument = viewDocument;

// --- RENDERING ENGINE ---

function render() {
    const root = document.getElementById('app');
    root.innerHTML = '';

    if (state.currentPage === 'login') {
        root.appendChild(LoginView());
    } else if (state.currentPage === 'signup') {
        root.appendChild(SignupView());
    } else {
        const layout = document.createElement('div');
        layout.className = `dashboard-layout animate-fade-in ${state.sidebarOpen ? 'sidebar-open' : ''}`;

        // Mobile Overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.onclick = () => window.toggleSidebar();
        layout.appendChild(overlay);

        layout.appendChild(Sidebar());

        const main = document.createElement('main');
        main.className = 'main-content';

        // Mobile Header
        main.appendChild(MobileHeader());

        if (state.currentPage === 'dashboard') main.appendChild(DashboardView());
        else if (state.currentPage === 'list') main.appendChild(ListView());
        else if (state.currentPage === 'profile') main.appendChild(ProfileView());
        else if (state.currentPage === 'admin-dashboard') {
            AdminDashboardView().then(view => main.appendChild(view));
        }
        else if (state.currentPage === 'admin-analytics') main.appendChild(AdminAnalyticsView());
        else if (state.currentPage === 'admin-employees') {
            AdminEmployeesView().then(view => main.appendChild(view));
        }
        else if (state.currentPage.startsWith('admin-edit-employee-')) {
            const id = state.currentPage.replace('admin-edit-employee-', '');
            AdminEditEmployeeView(id).then(view => main.appendChild(view));
        }
        else if (state.currentPage === 'admin-upload') {
            AdminUploadView().then(view => main.appendChild(view));
        }
        else if (state.currentPage.startsWith('details-')) {
            const id = state.currentPage.split('-')[1];
            const slip = state.payslips.find(s => s.id === id);
            main.appendChild(DetailsView(slip));
        }

        layout.appendChild(main);
        root.appendChild(layout);
    }
    lucide.createIcons();
}

// --- VIEWS & COMPONENTS ---

function Sidebar() {
    const aside = document.createElement('aside');
    aside.className = 'sidebar';
    aside.innerHTML = `
        <div style="margin-bottom: 2rem; padding: 0 1rem;">
            <div style="display: flex; align-items: center; gap: 10px; color: var(--primary);">
                <i data-lucide="shield-check"></i>
                <h2 style="font-size: 1.25rem;">Holerite App</h2>
            </div>
        </div>
        <nav style="flex: 1;">
            <a href="#" class="nav-item ${state.currentPage === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard'); return false;">
                <i data-lucide="layout-dashboard"></i> Dashboard
            </a>
            <a href="#" class="nav-item ${state.currentPage === 'list' ? 'active' : ''}" onclick="navigate('list'); return false;">
                <i data-lucide="file-text"></i> Meus Holerites
            </a>
            <a href="#" class="nav-item ${state.currentPage === 'profile' ? 'active' : ''}" onclick="navigate('profile'); return false;">
                <i data-lucide="user"></i> Meu Perfil
            </a>
            ${state.user?.profile?.role === 'admin' ? `
            <div style="margin: 1.5rem 0.5rem 0.5rem; font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Área Administrativa</div>
            <a href="#" class="nav-item ${state.currentPage === 'admin-dashboard' ? 'active' : ''}" onclick="navigate('admin-dashboard'); return false;">
                <i data-lucide="layout-dashboard"></i> Início Admin
            </a>
            <a href="#" class="nav-item ${state.currentPage === 'admin-analytics' ? 'active' : ''}" onclick="navigate('admin-analytics'); return false;">
                <i data-lucide="bar-chart-3"></i> Analytics
            </a>
            <a href="#" class="nav-item ${state.currentPage === 'admin-employees' ? 'active' : ''}" onclick="navigate('admin-employees'); return false;">
                <i data-lucide="users"></i> Gerenciar Colaboradores
            </a>
            <a href="#" class="nav-item ${state.currentPage === 'admin-upload' ? 'active' : ''}" onclick="navigate('admin-upload'); return false;">
                <i data-lucide="upload-cloud"></i> Upload de Lotes
            </a>
            ` : ''}
        </nav>
        <div style="padding: 1rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="navigate('profile')">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
                ${state.user?.profile?.full_name.charAt(0) || 'U'}
            </div>
            <div>
                <p style="font-weight: 600; font-size: 0.875rem;">${state.user?.profile?.full_name || 'Usuário'}</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary);">${state.user?.profile?.role || 'Cargo'}</p>
            </div>
        </div>
        <button class="nav-item" onclick="logout()" style="margin-top: 0.5rem; color: var(--danger); background: none; border: none; width: 100%; cursor: pointer; text-align: left;">
            <i data-lucide="log-out"></i> Sair
        </button>
    `;
    return aside;
}

function MobileHeader() {
    const header = document.createElement('header');
    header.className = 'mobile-header';
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; color: var(--primary);">
            <i data-lucide="shield-check"></i>
            <h2 style="font-size: 1.125rem; font-weight: 700;">Holerite App</h2>
        </div>
        <button class="menu-toggle" onclick="toggleSidebar()">
            <i data-lucide="${state.sidebarOpen ? 'x' : 'menu'}"></i>
        </button>
    `;
    return header;
}

function LoginView() {
    const container = document.createElement('div');
    container.style.cssText = 'width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; background-color: var(--bg-foundation);';
    container.innerHTML = `
        <div class="premium-card animate-fade-in" style="width: 400px;">
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="width: 64px; height: 64px; background: #eff6ff; color: var(--primary); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
                    <i data-lucide="shield-check" style="width: 32px; height: 32px;"></i>
                </div>
                <h1 style="font-size: 1.5rem; font-weight: 700;">Bem-vindo</h1>
                <p style="font-size: 0.875rem; color: #64748b; margin-top: 0.5rem; line-height: 1.5;">Acesse sua conta para visualizar seus holerites e informações de perfil.</p>
            </div>
            <form onsubmit="event.preventDefault(); login(this.email.value, this.password.value);" style="display: flex; flex-direction: column; gap: 1.25rem;">
                <input name="email" type="email" placeholder="E-mail" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                <input name="password" type="password" placeholder="Senha" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                <button type="submit" class="btn btn-primary" style="padding: 0.875rem; font-weight: 700;">Entrar</button>
            </form>
            <div style="margin-top: 1.5rem; text-align: center;">
                <p style="font-size: 0.875rem; color: var(--text-secondary);">Não tem uma conta? <a href="#" onclick="navigate('signup'); return false;" style="color: var(--primary); font-weight: 600;">Cadastre-se</a></p>
            </div>
        </div>
    `;
    return container;
}

function SignupView() {
    const container = document.createElement('div');
    container.style.cssText = 'width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; background-color: var(--bg-foundation);';
    container.innerHTML = `
        <div class="premium-card animate-fade-in" style="width: 400px;">
            <h1 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center;">Criar Conta</h1>
            <form onsubmit="event.preventDefault(); signup(this.email.value, this.password.value, this.fullName.value, this.cpf.value);" style="display: flex; flex-direction: column; gap: 1.25rem;">
                <input name="fullName" type="text" placeholder="Nome Completo" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                <input name="cpf" type="text" placeholder="CPF (Apenas números)" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                <input name="email" type="email" placeholder="E-mail" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                <input name="password" type="password" placeholder="Senha" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                <button type="submit" class="btn btn-primary" style="padding: 0.875rem; font-weight: 700;">Cadastrar</button>
            </form>
            <div style="margin-top: 1.5rem; text-align: center;">
                <p style="font-size: 0.875rem; color: var(--text-secondary);">Já tem uma conta? <a href="#" onclick="navigate('login'); return false;" style="color: var(--primary); font-weight: 600;">Login</a></p>
            </div>
        </div>
    `;
    return container;
}

function DashboardView() {
    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.875rem; font-weight: 700;">Dashboard</h1>
            <p style="color: var(--text-secondary);">Olá, ${state.user?.profile?.full_name}. Aqui estão seus documentos.</p>
        </header>

        <section style="display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-bottom: 2rem;">
            <div class="premium-card">
                <h3>Último Holerite</h3>
                <p>${state.payslips[0]?.reference_month || 'Nenhum disponível'}</p>
                <button class="btn btn-primary btn-sm" style="margin-top: 1rem;" onclick="navigate('list')">Ver Todos</button>
            </div>
        </section>
    `;
    return container;
}

function ListView() {
    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.875rem; font-weight: 700;">Meus Holerites</h1>
        </header>
        <div style="display: grid; gap: 1rem;">
            ${state.payslips.length > 0 ? state.payslips.map(doc => `
                <div class="premium-card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="font-weight: 600;">Holerite - ${doc.reference_month}</p>
                        <p style="font-size: 0.75rem; color: var(--text-secondary);">Data: ${new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    <button onclick="viewDocument('${doc.file_url}')" class="btn btn-outline btn-sm">Visualizar</button>
                </div>
            `).join('') : '<p>Você ainda não possui holerites cadastrados.</p>'}
        </div>
    `;
    return container;
}

function ProfileView() {
    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.875rem; font-weight: 700;">Meu Perfil</h1>
            <p style="color: var(--text-secondary);">Visualize e gerencie suas informações.</p>
        </header>

        <div class="premium-card">
            <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 600;">
                    ${state.user?.profile?.full_name.charAt(0) || 'U'}
                </div>
                <div>
                    <h3 style="font-size: 1.25rem; font-weight: 700;">${state.user?.profile?.full_name}</h3>
                    <p style="color: var(--text-secondary);">${state.user?.profile?.role === 'admin' ? 'Administrador RH' : 'Colaborador'}</p>
                </div>
            </div>

            <form onsubmit="event.preventDefault(); updateProfile(this.fullName.value, this.department.value);" style="display: grid; gap: 1.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Nome Completo</label>
                        <input name="fullName" type="text" value="${state.user?.profile?.full_name || ''}" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Departamento</label>
                        <input name="department" type="text" value="${state.user?.profile?.department || ''}" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">E-mail</label>
                        <input type="email" value="${state.user?.email || ''}" disabled class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: #f8fafc; cursor: not-allowed;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">CPF</label>
                        <input type="text" value="${state.user?.profile?.cpf || ''}" disabled class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: #f8fafc; cursor: not-allowed;">
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                    <button type="submit" class="btn btn-primary" style="padding: 0.75rem 2rem;">Salvar Alterações</button>
                </div>
            </form>
        </div>
    `;
    return container;
}

async function updateProfile(fullName, department) {
    // We use upsert to ensure the profile exists even if signup failed to create it
    const { error } = await supabase
        .from('profiles')
        .upsert({
            id: state.user.id,
            full_name: fullName,
            department: department,
            role: state.user.profile.role || 'employee',
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Error updating profile:', error);
        showToast('Erro ao atualizar perfil: ' + error.message, 'error');
    } else {
        showToast('Perfil atualizado com sucesso!', 'success');
        await initApp();
    }
}

window.updateProfile = updateProfile;

async function AdminDashboardView() {
    const { count: totalEmployees } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { data: recentDocs } = await supabase
        .from('documents')
        .select('*, profiles(full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(5);

    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
                <h1 style="font-size: 1.875rem; font-weight: 800; tracking: -0.025em;">Painel Administrativo</h1>
                <p style="color: var(--text-secondary); margin-top: 0.25rem;">Gestão em tempo real conectada ao Supabase.</p>
            </div>
        </header>

        <section style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 2rem;">
            <div class="premium-card">
                <p style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500;">Total de Colaboradores</p>
                <h3 style="font-size: 2rem; font-weight: 800; margin-top: 0.25rem;">${totalEmployees || 0}</h3>
            </div>
            <div class="premium-card">
                <p style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500;">Armazenamento</p>
                <div style="width: 100%; height: 8px; background: #eee; border-radius: 4px; margin-top: 1rem;">
                    <div style="width: 5%; height: 100%; background: var(--primary); border-radius: 4px;"></div>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">< 1% de 1GB usado</p>
            </div>
            <div class="premium-card" style="background: var(--primary); color: white;">
                <p style="font-size: 0.875rem; font-weight: 500; opacity: 0.9;">Ações Rápidas</p>
                <button class="btn" style="background: white; color: var(--primary); margin-top: 1rem; width: 100%;" onclick="navigate('admin-upload')">Novo Upload</button>
            </div>
        </section>

        <section class="premium-card" style="padding: 0; overflow: hidden;">
            <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <h3 style="font-size: 1.125rem; font-weight: 700;">Atividades Recentes</h3>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8fafc; text-align: left;">
                        <tr style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
                            <th style="padding: 1rem 1.5rem;">Colaborador</th>
                            <th style="padding: 1rem 1.5rem;">Documento</th>
                            <th style="padding: 1rem 1.5rem;">Data</th>
                            <th style="padding: 1rem 1.5rem; text-align: right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentDocs?.map(doc => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 1rem 1.5rem; font-weight: 600;">${doc.profiles?.full_name}</td>
                                <td style="padding: 1rem 1.5rem; color: var(--text-secondary);">${doc.type} - ${doc.reference_month}</td>
                                <td style="padding: 1rem 1.5rem; color: var(--text-secondary);">${new Date(doc.created_at).toLocaleDateString()}</td>
                                <td style="padding: 1rem 1.5rem; text-align: right;">
                                    <button onclick="viewDocument('${doc.file_url}')" style="background: none; border: none; color: var(--primary); cursor: pointer;"><i data-lucide="external-link"></i></button>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="4" style="padding: 2rem; text-align: center;">Nenhum documento encontrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    `;
    lucide.createIcons();
    return container;
}

function AdminAnalyticsView() {
    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.875rem; font-weight: 800;">Analytics Real-Time</h1>
            <p style="color: var(--text-secondary);">Monitoramento de uso do Supabase Storage.</p>
        </header>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;">
            <div class="premium-card">
                <h3 style="font-weight: 700; margin-bottom: 1rem;">Volume de Documentos</h3>
                <div style="display: flex; align-items: flex-end; gap: 1rem; height: 150px; padding-top: 1rem;">
                    ${[30, 45, 60, 20, 90, 10].map(h => `
                        <div style="flex: 1; background: var(--primary); opacity: 0.2; height: ${h}%; border-radius: 4px;"></div>
                    `).join('')}
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.75rem;">
                    <span>JAN</span><span>FEV</span><span>MAR</span><span>ABR</span><span>MAI</span><span>JUN</span>
                </div>
            </div>
            
            <div class="premium-card" style="background: #f8fafc;">
                <h3 style="font-weight: 700; margin-bottom: 1rem;">Custo Estimado</h3>
                <p style="font-size: 2rem; font-weight: 800; color: #059669;">USD 0,00</p>
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">Você está dentro do plano gratuito.</p>
            </div>
        </div>

        <div class="premium-card" style="margin-top: 2rem; border: 1px solid #fee2e2;">
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #fee2e2; padding-bottom: 2rem; margin-bottom: 0.5rem;">
                    <div>
                        <h3 style="font-weight: 700; color: #991b1b; margin-bottom: 0.5rem;">🗓️ Limpeza por Período</h3>
                        <p style="font-size: 0.875rem; color: #b91c1c;">Apaga todos os holerites de um mês de referência específico.</p>
                    </div>
                    <div style="display: flex; gap: 1rem; align-items: center;">
                        <input type="month" id="deleteBatchMonth" class="form-input" style="width: 200px; padding: 0.56rem;">
                        <button onclick="adminDeleteByMonth()" class="btn btn-danger" style="background: #ef4444;">Apagar Mês</button>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="font-weight: 700; color: #991b1b; margin-bottom: 0.5rem;">🚨 Limpeza Total (Reset)</h3>
                        <p style="font-size: 0.875rem; color: #b91c1c;">Apaga TODOS os arquivos de teste do sistema de forma permanente.</p>
                    </div>
                    <button onclick="adminClearAllHolerites()" class="btn btn-danger" style="background: #b91c1c;">Apagar Tudo</button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
    return container;
}

async function AdminUploadView() {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, cpf');
    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.875rem; font-weight: 800;">Upload em Massa</h1>
            <p style="color: var(--text-secondary);">Arraste múltiplos PDFs. O sistema fará o matching via CPF automaticamente.</p>
        </header>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <div id="dropzone" style="border: 2px dashed var(--border); border-radius: 16px; padding: 4rem 2rem; text-align: center; background: #f8fafc; cursor: pointer; transition: all 0.2s;">
                    <div style="width: 64px; height: 64px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; box-shadow: var(--shadow-sm);">
                        <i data-lucide="upload-cloud" style="color: var(--primary);"></i>
                    </div>
                    <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem;">Arraste os holerites aqui</h3>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">Ou clique para selecionar múltiplos arquivos PDF</p>
                    <input type="file" id="bulkFiles" accept="application/pdf" multiple style="display: none;">
                </div>

                <div class="premium-card" style="margin-top: 1.5rem;">
                    <h3 style="font-weight: 700; margin-bottom: 1rem;">Configurações do Lote</h3>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Mês de Referência</label>
                            <input type="month" id="batchMonth" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                        </div>
                        <button id="processBtn" class="btn btn-primary" style="width: 100%;" disabled>Processar Lote</button>
                    </div>
                </div>
            </div>

            <div id="matchingResults" class="premium-card" style="display: none; height: 500px; overflow-y: auto;">
                <h3 style="font-weight: 700; margin-bottom: 1.5rem; display: flex; justify-content: space-between;">
                    Matching Automático 
                    <span id="matchStats" style="font-size: 0.875rem; color: var(--primary);">0 arquivos</span>
                </h3>
                <div id="matchList" style="display: flex; flex-direction: column; gap: 1rem;"></div>
            </div>
        </div>

        <div id="progressModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 999; align-items: center; justify-content: center;">
            <div class="premium-card" style="width: 400px; text-align: center;">
                <h3 style="font-weight: 700; margin-bottom: 1rem;">Processando Uploads</h3>
                <div style="width: 100%; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 1rem;">
                    <div id="progressBar" style="width: 0%; height: 100%; background: var(--primary); transition: width 0.3s;"></div>
                </div>
                <p id="progressStatus" style="font-size: 0.875rem; color: var(--text-secondary);">Enviando documento 0 de 0...</p>
            </div>
        </div>
    `;

    const dropzone = container.querySelector('#dropzone');
    const fileInput = container.querySelector('#bulkFiles');
    const batchMonth = container.querySelector('#batchMonth');
    const processBtn = container.querySelector('#processBtn');
    const matchingResults = container.querySelector('#matchingResults');
    const matchList = container.querySelector('#matchList');
    const matchStats = container.querySelector('#matchStats');
    const progressModal = container.querySelector('#progressModal');
    const progressBar = container.querySelector('#progressBar');
    const progressStatus = container.querySelector('#progressStatus');

    let stagedFiles = [];

    dropzone.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        stagedFiles = files.map(file => {
            const cpfMatch = file.name.match(/\d{11}/);
            const cpf = cpfMatch ? cpfMatch[0] : null;
            const profile = profiles?.find(p => p.cpf === cpf);
            return { file, cpf, profile };
        });

        renderMatches();
    };

    function renderMatches() {
        matchList.innerHTML = '';
        stagedFiles.forEach((item, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border);';
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                    <div style="width: 32px; height: 32px; background: white; border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-sm);">
                        <i data-lucide="file-text" style="width: 16px; color: ${item.profile ? 'var(--primary)' : 'var(--danger)'}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <p style="font-size: 0.875rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.file.name}</p>
                        <p style="font-size: 0.75rem; color: var(--text-secondary);">${item.cpf ? `CPF: ${item.cpf}` : 'Sem CPF no nome'}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="text-align: right;">
                        ${item.profile ?
                    `<span style="color: #059669; font-size: 0.75rem; font-weight: 700;">✓ ${item.profile.full_name.split(' ')[0]}</span>` :
                    `<span style="color: var(--danger); font-size: 0.75rem; font-weight: 700;">✗ sem match</span>`}
                    </div>
                    <button class="btn-remove" data-index="${index}" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s;">
                        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
            `;

            row.querySelector('.btn-remove').onclick = (e) => {
                e.stopPropagation();
                stagedFiles.splice(index, 1);
                renderMatches();
            };

            matchList.appendChild(row);
        });

        matchingResults.style.display = stagedFiles.length > 0 ? 'block' : 'none';
        matchStats.textContent = `${stagedFiles.length} arquivos`;
        processBtn.disabled = stagedFiles.length === 0 || !batchMonth.value;
        lucide.createIcons();
    }

    batchMonth.onchange = () => {
        processBtn.disabled = stagedFiles.length === 0 || !batchMonth.value;
    };

    processBtn.onclick = async () => {
        const tasks = stagedFiles.filter(i => i.profile);
        showToast('Nenhum arquivo encontrado.', 'info');

        const confirmed = await showConfirm('Confirmar Upload', `Deseja iniciar o upload de ${tasks.length} documentos?`);
        if (!confirmed) return;

        progressModal.style.display = 'flex';
        const total = tasks.length;
        let successCount = 0;

        for (let i = 0; i < total; i++) {
            const item = tasks[i];
            progressStatus.textContent = `Enviando ${i + 1} de ${total}: ${item.file.name}`;
            progressBar.style.width = `${((i + 1) / total) * 100}%`;

            try {
                const filePath = `${item.profile.id}/${Date.now()}-${item.file.name}`;
                await supabase.storage.from('holerites').upload(filePath, item.file);

                await supabase.from('documents').insert([{
                    profile_id: item.profile.id,
                    type: 'holerite',
                    reference_month: batchMonth.value,
                    file_url: filePath // We store the path now for better security with signed URLs
                }]);
                successCount++;
            } catch (err) {
                console.error(`Erro no arquivo ${item.file.name}:`, err);
            }
        }

        progressModal.style.display = 'none';
        showToast(`Upload concluído! ${successCount} processados.`, 'success');
        navigate('admin-dashboard');
    };

    lucide.createIcons();
    return container;
}

async function AdminEmployeesView() {
    const { data: employees, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h1 style="font-size: 1.875rem; font-weight: 800;">Gerenciar Colaboradores</h1>
                <p style="color: var(--text-secondary);">Lista total de perfis cadastrados.</p>
            </div>
        </header>

        <section class="premium-card" style="padding: 0; overflow: hidden;">
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: #f8fafc; text-align: left;">
                        <tr style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">
                            <th style="padding: 1rem 1.5rem;">Nome / CPF</th>
                            <th style="padding: 1rem 1.5rem;">Departamento</th>
                            <th style="padding: 1rem 1.5rem;">Cargo</th>
                            <th style="padding: 1rem 1.5rem; text-align: right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${employees?.map(emp => `
                            <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                <td style="padding: 1rem 1.5rem;">
                                    <p style="font-weight: 600;">${emp.full_name}</p>
                                    <p style="font-size: 0.75rem; color: var(--text-secondary);">${emp.cpf || 'Sem CPF'}</p>
                                </td>
                                <td style="padding: 1rem 1.5rem; color: var(--text-secondary);">${emp.department || 'Não definido'}</td>
                                <td style="padding: 1rem 1.5rem;">
                                    <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; background: ${emp.role === 'admin' ? '#fee2e2; color: #991b1b;' : '#f1f5f9; color: #475569;'}">
                                        ${emp.role === 'admin' ? 'Admin' : 'Colaborador'}
                                    </span>
                                </td>
                                <td style="padding: 1rem 1.5rem; text-align: right; display: flex; justify-content: flex-end; gap: 0.5rem;">
                                    <button class="btn btn-outline btn-sm" onclick="navigate('admin-edit-employee-${emp.id}')">
                                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                                    </button>
                                    <button class="btn btn-sm" style="background: #fee2e2; color: #991b1b; padding: 0.5rem;" onclick="adminDeleteEmployee('${emp.id}', '${emp.full_name}')" title="Excluir Colaborador">
                                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="4" style="padding: 2rem; text-align: center;">Nenhum colaborador encontrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    `;
    lucide.createIcons();
    return container;
}

async function AdminEditEmployeeView(id) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        showToast('Erro ao carregar perfil: ' + error.message, 'error');
        navigate('admin-employees');
        return;
    }

    const container = document.createElement('div');
    container.innerHTML = `
        <header style="margin-bottom: 2rem;">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                <button class="menu-toggle" onclick="navigate('admin-employees')" style="padding: 0; color: var(--text-secondary);">
                    <i data-lucide="arrow-left"></i>
                </button>
                <h1 style="font-size: 1.875rem; font-weight: 800;">Editar Colaborador</h1>
            </div>
            <p style="color: var(--text-secondary); margin-left: 2.5rem;">Alterando informações de ${profile.full_name}</p>
        </header>

        <div class="premium-card">
            <form onsubmit="event.preventDefault(); adminUpdateProfile('${profile.id}', this.fullName.value, this.department.value, this.cpf.value, this.role.value);" style="display: grid; gap: 1.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Nome Completo</label>
                        <input name="fullName" type="text" value="${profile.full_name || ''}" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Departamento</label>
                        <input name="department" type="text" value="${profile.department || ''}" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">CPF</label>
                        <input name="cpf" type="text" value="${profile.cpf || ''}" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Cargo / Acesso</label>
                        <select name="role" required class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: white;">
                            <option value="employee" ${profile.role === 'employee' ? 'selected' : ''}>Colaborador</option>
                            <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Administrador RH</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
                    <button type="button" class="btn btn-outline" onclick="navigate('admin-employees')">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="padding: 0.75rem 2rem;">Salvar Alterações</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
    return container;
}

async function adminUpdateProfile(id, fullName, department, cpf, role) {
    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            department: department,
            cpf: cpf.replace(/\D/g, ''),
            role: role,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) {
        showToast('Erro ao atualizar colaborador: ' + error.message, 'error');
    } else {
        showToast('Colaborador atualizado com sucesso!', 'success');
        navigate('admin-employees');
    }
}

async function adminClearAllHolerites() {
    const confirmed = await showConfirm('🚨 Ação Destrutiva', 'Isso vai apagar TODOS os holerites do banco e TODAS as pastas do storage. Tem certeza absoluta?', 'Apagar Tudo', 'Cancelar');
    if (!confirmed) return;

    try {
        // 1. Delete all database records (RLS policies will allow this for admins)
        const { error: dbError } = await supabase.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (dbError) throw dbError;

        // 2. Clear Storage
        // List all folders in 'holerites'
        const { data: folders, error: listError } = await supabase.storage.from('holerites').list();
        if (listError) throw listError;

        if (folders && folders.length > 0) {
            for (const folder of folders) {
                // List files in folder
                const { data: files } = await supabase.storage.from('holerites').list(folder.name);
                if (files && files.length > 0) {
                    const paths = files.map(f => `${folder.name}/${f.name}`);
                    await supabase.storage.from('holerites').remove(paths);
                }
            }
        }

        showToast('Limpeza concluída! Todos os dados foram removidos.', 'success');
        navigate('admin-dashboard');
    } catch (err) {
        console.error('Erro na limpeza:', err);
        showToast('Erro na limpeza: ' + err.message, 'error');
    }
}

async function adminDeleteByMonth() {
    const month = document.getElementById('deleteBatchMonth').value;
    if (!month) return showToast('Selecione um mês para apagar.', 'info');

    const confirmed = await showConfirm('⚠️ Confirmar Exclusão', `Tem certeza que deseja apagar TODOS os holerites de ${month}? Isto é irreversível.`, 'Apagar Lote', 'Cancelar');
    if (!confirmed) return;

    try {
        // 1. Get documents for that month
        const { data: docs, error: fetchError } = await supabase
            .from('documents')
            .select('id, file_url')
            .eq('type', 'holerite')
            .eq('reference_month', month);

        if (fetchError) throw fetchError;
        if (!docs || docs.length === 0) return showToast('Nenhum documento encontrado para este mês.', 'info');

        // 2. Delete files from Storage
        const filePaths = docs.map(d => d.file_url).filter(p => !!p);
        if (filePaths.length > 0) {
            const { error: storageError } = await supabase.storage.from('holerites').remove(filePaths);
            if (storageError) console.error('Storage deletion partial error:', storageError);
        }

        // 3. Delete DB records
        const { error: dbError } = await supabase
            .from('documents')
            .delete()
            .in('id', docs.map(d => d.id));

        if (dbError) throw dbError;

        showToast(`Remoção concluída! ${docs.length} holerites foram apagados.`, 'success');
        navigate('admin-dashboard');
    } catch (err) {
        console.error('Erro na limpeza por mês:', err);
        showToast('Erro na limpeza: ' + err.message, 'error');
    }
}

async function adminDeleteEmployee(id, name) {
    const confirmed = await showConfirm('🚨 Confirmar Exclusão', `Tem certeza que deseja apagar o colaborador ${name}? Todos os seus holerites e dados de perfil serão removidos permanentemente.`, 'Apagar Colaborador', 'Cancelar');
    if (!confirmed) return;

    try {
        // 1. Delete documents (must be first due to FK)
        const { error: docError } = await supabase.from('documents').delete().eq('profile_id', id);
        if (docError) throw docError;

        // 2. Delete profile
        const { error: profileError } = await supabase.from('profiles').delete().eq('id', id);
        if (profileError) throw profileError;

        showToast(`Colaborador ${name} removido com sucesso!`, 'success');
        navigate('admin-employees');
    } catch (err) {
        console.error('Erro ao deletar colaborador:', err);
        showToast('Erro ao deletar: ' + err.message, 'error');
    }
}

window.adminUpdateProfile = adminUpdateProfile;
window.adminClearAllHolerites = adminClearAllHolerites;
window.adminDeleteByMonth = adminDeleteByMonth;
window.adminDeleteEmployee = adminDeleteEmployee;

function DetailsView(slip) {
    const container = document.createElement('div');
    container.innerHTML = `<h1 class="premium-card">Detalhes do Holerite</h1>`;
    return container;
}
