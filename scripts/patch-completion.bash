_patch_complete() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local opts
  opts=$(ls -1 patches/*.patch 2>/dev/null | xargs -n1 basename | sed 's/\.patch$//')
  COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
}
complete -F _patch_complete do undo scripts/do scripts/undo
