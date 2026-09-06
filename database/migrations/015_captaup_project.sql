INSERT INTO projects(slug, name, trial_days, github_repo, github_url)
VALUES (
  'captaup',
  'CaptaUP Analytics',
  0,
  'CaptaUP-Analytics-',
  'https://github.com/raphaelbuenocaptacao-creator/CaptaUP-Analytics-'
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    github_repo = EXCLUDED.github_repo,
    github_url = EXCLUDED.github_url;

INSERT INTO project_environments(project_id, name)
SELECT p.id, env.name
FROM projects p
CROSS JOIN (VALUES ('development'), ('preview'), ('production')) AS env(name)
WHERE p.slug = 'captaup'
ON CONFLICT(project_id, name) DO NOTHING;
