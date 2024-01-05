# ed-helm-template
Helm stores cache, configuration, and data based on the following configuration order:

- If a HELM_*_HOME environment variable is set, it will be used
- Otherwise, on systems supporting the XDG base directory specification, the XDG variables will be used
- When no other location is set a default location will be used based on the operating system

By default, the default directories depend on the Operating System. The defaults are listed below:

| Operating System | Cache Path                | Configuration Path             | Data Path               |
|------------------|---------------------------|--------------------------------|-------------------------|
| Linux            | $HOME/.cache/helm         | $HOME/.config/helm             | $HOME/.local/share/helm |
| macOS            | $HOME/Library/Caches/helm | $HOME/Library/Preferences/helm | $HOME/Library/helm      |
| Windows          | %TEMP%\helm               | %APPDATA%\helm                 | %APPDATA%\helm          |

## First time
```bash
cd $HELM_DATA_HOME
mkdir starters
cd starters
git clone https://gitlab.essential-data.sk/essentialdata/ed-spring-boot-helm-starter.git
cd $NEW_PROJECT_HOME/helm
helm create NEW_PROJECT_NAME --starter ed-spring-boot-helm-starter
```

- $HELM_DATA_HOME - Viď vyššie
- $NEW_PROJECT_HOME - cesta do rootu vášho spring boot projektu
- NEW_PROJECT_NAME - názov vášho projektu
## Second+ time
```bash
cd $HELM_DATA_HOME/starters/ed-spring-boot-helm-starter
git pull
cd $NEW_PROJECT_HOME/helm
helm create NEW_PROJECT_NAME --starter ed-spring-boot-helm-starter
```

- $HELM_DATA_HOME - Viď vyššie
- $NEW_PROJECT_HOME - cesta do rootu vášho spring boot projektu
- NEW_PROJECT_NAME - názov vášho projektu
