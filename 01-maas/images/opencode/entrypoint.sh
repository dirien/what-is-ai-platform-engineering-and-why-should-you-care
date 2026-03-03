#!/bin/bash
set -euo pipefail

STARTUP_CWD_FILE="/workspace/.startup-cwd"
DEFAULT_WORKDIR="/workspace"

clone_repo_fallback() {
    if [ -z "${GIT_REPO:-}" ]; then
        return
    fi

    local repo_name target_dir
    repo_name="$(basename "${GIT_REPO}")"
    repo_name="${repo_name%.git}"
    if [ -z "${repo_name}" ] || [ "${repo_name}" = "." ] || [ "${repo_name}" = "/" ]; then
        repo_name="project"
    fi
    target_dir="/workspace/${repo_name}"

    if [ ! -d "${target_dir}/.git" ]; then
        echo "Init fallback: cloning ${GIT_REPO} into ${target_dir}"
        if ! git clone --depth 1 "${GIT_REPO}" "${target_dir}"; then
            echo "Warning: git clone failed for ${GIT_REPO}" >&2
            return
        fi
    fi

    printf '%s' "${target_dir}" > "${STARTUP_CWD_FILE}"
}

# Prefer initContainer-selected startup path.
if [ -s "${STARTUP_CWD_FILE}" ]; then
    startup_dir="$(cat "${STARTUP_CWD_FILE}")"
    if [ -d "${startup_dir}" ]; then
        cd "${startup_dir}"
    fi
else
    # Backward-compatible fallback when initContainer did not run.
    clone_repo_fallback
    if [ -s "${STARTUP_CWD_FILE}" ]; then
        startup_dir="$(cat "${STARTUP_CWD_FILE}")"
        if [ -d "${startup_dir}" ]; then
            cd "${startup_dir}"
        fi
    else
        cd "${DEFAULT_WORKDIR}"
    fi
fi

exec opencode web --hostname 0.0.0.0 --port 8080
