ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_github_repo_unique
  ON projects (lower(github_repo))
  WHERE github_repo IS NOT NULL;

WITH repo_catalog(name, slug, github_repo, github_url) AS (
  VALUES
    ('Arena sx', 'arena-sx', 'Arena-sx', 'https://github.com/raphaelbuenocaptacao-creator/Arena-sx'),
    ('AUREON COMMERCE OS', 'aureon-commerce-os', 'AUREON-COMMERCE-OS', 'https://github.com/raphaelbuenocaptacao-creator/AUREON-COMMERCE-OS'),
    ('AUTHORITY OS', 'authority-os', 'AUTHORITY-OS', 'https://github.com/raphaelbuenocaptacao-creator/AUTHORITY-OS'),
    ('Campeonatos Fut', 'campeonatosfut', 'Campeonatosfut', 'https://github.com/raphaelbuenocaptacao-creator/Campeonatosfut'),
    ('Campos Pass', 'campos-pass', 'Campos-Pass', 'https://github.com/raphaelbuenocaptacao-creator/Campos-Pass'),
    ('CaptaPro', 'captapro', 'captaPro', 'https://github.com/raphaelbuenocaptacao-creator/captaPro'),
    ('CaptaPro Analytics PWA', 'captapro-analytics-pwa', 'CaptaPro-Analytics-PWA', 'https://github.com/raphaelbuenocaptacao-creator/CaptaPro-Analytics-PWA'),
    ('Casamento Josy Luiz', 'casamento-josy-luiz', 'Casamento-Josy-Luiz', 'https://github.com/raphaelbuenocaptacao-creator/Casamento-Josy-Luiz'),
    ('Consultoria e Relatório', 'consultoria-e-relat-rio', 'Consultoria-e-relat-rio', 'https://github.com/raphaelbuenocaptacao-creator/Consultoria-e-relat-rio'),
    ('CRPay', 'crpay', 'CRPay', 'https://github.com/raphaelbuenocaptacao-creator/CRPay'),
    ('Drak AI', 'drak-ai', 'Drak-ai', 'https://github.com/raphaelbuenocaptacao-creator/Drak-ai'),
    ('Gamificação 300', 'gamificacao300', 'Gamificacao300', 'https://github.com/raphaelbuenocaptacao-creator/Gamificacao300'),
    ('Imobiliária Elizabete', 'imobili-ria-elizabete', 'Imobili-ria-Elizabete', 'https://github.com/raphaelbuenocaptacao-creator/Imobili-ria-Elizabete'),
    ('ManagerPro Gestão', 'managerpro-gest-o', 'ManagerPro-gest-o-', 'https://github.com/raphaelbuenocaptacao-creator/ManagerPro-gest-o-'),
    ('Mundo da Sarah', 'mundo-da-sarah', 'Mundo-da-Sarah', 'https://github.com/raphaelbuenocaptacao-creator/Mundo-da-Sarah'),
    ('NEYVIX', 'neyvix', 'NEYVIX', 'https://github.com/raphaelbuenocaptacao-creator/NEYVIX'),
    ('NUBYX', 'nubyx', 'NUBYX', 'https://github.com/raphaelbuenocaptacao-creator/NUBYX'),
    ('Resultados e Performance', 'rasultados-e-perfomance', 'RASULTADOS-E-PERFOMANCE', 'https://github.com/raphaelbuenocaptacao-creator/RASULTADOS-E-PERFOMANCE'),
    ('RBS Git Agent', 'rbs-git-agent', 'RBS-Git-Agent', 'https://github.com/raphaelbuenocaptacao-creator/RBS-Git-Agent'),
    ('Sala de Vendas Kim', 'sala-de-vendas-kim', 'sala-de-vendas-kim', 'https://github.com/raphaelbuenocaptacao-creator/sala-de-vendas-kim'),
    ('TradeVision', 'tradevision', 'TradeVision', 'https://github.com/raphaelbuenocaptacao-creator/TradeVision'),
    ('Tron IA', 'tron-ia', 'Tron-Ia', 'https://github.com/raphaelbuenocaptacao-creator/Tron-Ia'),
    ('W.I.L Pay', 'wilpay', 'W.I.L-PAY', 'https://github.com/raphaelbuenocaptacao-creator/W.I.L-PAY')
)
INSERT INTO projects(slug, name, trial_days, github_repo, github_url)
SELECT slug, name, 0, github_repo, github_url
FROM repo_catalog
ON CONFLICT (slug) DO UPDATE
SET github_repo = EXCLUDED.github_repo,
    github_url = EXCLUDED.github_url;

INSERT INTO project_environments(project_id, name)
SELECT p.id, env.name
FROM projects p
CROSS JOIN (VALUES ('development'), ('preview'), ('production')) AS env(name)
WHERE p.github_repo IS NOT NULL
ON CONFLICT(project_id, name) DO NOTHING;
