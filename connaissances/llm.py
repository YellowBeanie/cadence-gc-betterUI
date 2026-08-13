"""Pont vers llm-adapter.sh : le cerveau est le CLI cloud, jamais la machine locale."""
import os, subprocess, sys, shutil
from pathlib import Path

class LlmIndisponible(RuntimeError):
    pass

def _executable_bash():
    """Retourne le chemin complet à bash.

    Sur Windows, `subprocess.run(['bash', ...])` cherche via CreateProcess qui regarde
    System32 AVANT PATH, trouvant WSL bash au lieu de Git Bash. WSL ne peut pas accéder
    aux chemins Windows et n'hérite pas des variables d'env (WSLENV insuffisant).

    Cette fonction épingle Git Bash en évitant le piège WSL:
    - Sur Windows: retourne le chemin complet à Git Bash, sauf si c'est WSL (System32)
    - Sinon: retourne 'bash' (recherche dans PATH)
    """
    if sys.platform == 'win32':
        bash = shutil.which('bash')
        if bash and ('system32' not in bash.lower() and 'windowsapps' not in bash.lower()):
            return bash
        # Éviter WSL, chercher Git Bash
        for git_bash in [
            r'C:\Program Files\Git\usr\bin\bash.exe',
            r'C:\Program Files\Git\bin\bash.exe'
        ]:
            if os.path.exists(git_bash):
                return git_bash
    return 'bash'

def _bin_defaut():
    return str(Path(__file__).resolve().parent.parent / "deploy" / "nas" / "llm-adapter.sh")

def appeler(prompt, timeout=300):
    bin_ = os.environ.get("LLM_ADAPTER_BIN") or _bin_defaut()
    bash_exe = _executable_bash()
    # llm-adapter.sh (fournisseur claude-cli, défaut) refuse tout appel sans
    # LLM_MODEL — par conception il n'a lui-même AUCUN défaut (chaque script
    # appelant du parc, analyse.sh/analyse-seance.sh/traite-audio.sh, fixe le
    # sien explicitement avant l'appel). connaissances/llm.py est le SEUL
    # point d'appel de ce sous-système (atelier PC comme connaissances.sh
    # NAS) : le défaut vit ici plutôt que dupliqué dans chaque script
    # appelant. Constaté en conditions réelles (tâche 11) : sans ce défaut,
    # le premier fichage sur le NAS échouait avec `ERREUR : LLM_MODEL absent`.
    # `LLM_MODEL` déjà positionné fait foi ; sinon `CONNAISSANCES_MODEL`
    # (même convention en cascade que les autres chaînes) ; sinon sonnet.
    env = os.environ.copy()
    if not env.get("LLM_MODEL"):
        env["LLM_MODEL"] = env.get("CONNAISSANCES_MODEL") or "sonnet"
    try:
        r = subprocess.run([bash_exe, bin_], input=prompt.encode("utf-8"),
                           capture_output=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired as e:
        raise LlmIndisponible("délai dépassé") from e
    if r.returncode != 0:
        raise LlmIndisponible(f"adaptateur LLM en échec (code {r.returncode})")
    return r.stdout.decode("utf-8", "replace").strip()
