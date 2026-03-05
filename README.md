# 💼 Holerite Premium - Gestão de Documentos

Uma aplicação de gestão de holerites ultra-moderna, segura e responsiva, desenvolvida para simplificar a entrega de documentos para colaboradores e a gestão para o RH.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![Supabase](https://img.shields.io/badge/backend-Supabase-3ec98e.svg)

---

## ✨ Funcionalidades

### 🏢 Área do RH (Admin)
*   **Upload em Massa**: Sistema inteligente que faz o *matching* automático de múltiplos PDFs via CPF no nome do arquivo.
*   **Gestão de Colaboradores**: Interface completa para pesquisar, editar dados de perfil ou remover colaboradores.
*   **Analytics & Manutenção**: Dashboard para monitorar volume de dados e ferramentas para limpeza de lotes específicos por mês ou reset total.

### 👤 Área do Colaborador
*   **Dashboard Intuitivo**: Visualização clara dos últimos holerites disponíveis.
*   **Perfil Personalizado**: Edição de dados básicos e departamento.
*   **Mobile First**: Totalmente adaptado para smartphones com menu hambúrguer e navegação otimizada.

---

## 🚀 Tecnologias Utilizadas

-   **Frontend**: HTML5, Vanilla CSS3 (Custom Design System), JavaScript (ES6+).
-   **Backend-as-a-Service**: [Supabase](https://supabase.com/) (Auth, PostgreSQL, Storage).
-   **UI/UX**: [Lucide Icons](https://lucide.dev/), Google Fonts (Inter).
-   **Animações**: Custom CSS Keyframes & Framer-like transitions.

---

## 🛠️ Como Clonar e Rodar

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/holerite.git
    cd holerite
    ```

2.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto com suas credenciais do Supabase:
    ```env
    VITE_SUPABASE_URL=sua_url_aqui
    VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
    ```

3.  **Instale as dependências e rode:**
    ```bash
    npm install
    npm run dev
    ```

---

## 🎨 Design System

O projeto utiliza um design system próprio focado em:
*   **Glassmorphism**: Efeitos de desfoque e transparência em modais e headers.
*   **Micro-interações**: Feedback visual instantâneo através de *Toasts* e transições de página.
*   **Acessibilidade**: Contrastes otimizados e suporte a leitores de tela.

---

## 📄 Licença

Este projeto está sob a licença [MIT](LICENSE).

---

Feito com ❤️.
