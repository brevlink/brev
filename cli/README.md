# brev-cli

CLI client for [Brev](https://github.com/matteo-genovese/brev).

```bash
pip install brev-cli

brev login user@example.com --server http://localhost:8000
brev token create --name laptop
brev create https://example.com --slug go --title "Example"
brev list
brev stats go
brev delete go
brev whoami
brev logout
```

`brev login` prompts for the password securely instead of reading it from shell
history. `brev token create` creates a revocable API key and stores it in
`~/.brev/config` with `0600` permissions.

For local development from this repository, install it with:

```bash
python3 -m pip install --user -e ./cli
```
