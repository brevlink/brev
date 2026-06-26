# brev-cli

CLI client for [Brev](https://github.com/brevlink/brev).

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

The login step proves who you are. The token step creates a long-lived key for
this device, so commands like `brev create`, `brev list`, and `brev stats` can
call your Brev server without asking for your password every time.

Use a different token name for each device or automation target:

```bash
brev token create --name laptop
brev token create --name github-actions
brev token create --name home-server
```

If one token is no longer needed, revoke that token without rotating your account
password or breaking your other devices.

For local development from this repository, install it with:

```bash
python3 -m pip install --user -e ./cli
```
