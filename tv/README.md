# HouseWorks — app da TV

Um app Android que abre o painel (`/panel`) em tela cheia, para instalar na TV. É uma `WebView`
de tela cheia com três coisas em volta: quiosque, recarga periódica e um aviso quando a rede cai.

---

## Por que WebView, e não PWABuilder / TWA

O caminho sugerido (PWABuilder → TWA) **não funciona em Android TV**, e o motivo é específico:
TWA não é um app, é uma casca que abre o **Chrome** do aparelho. A documentação do Chrome diz
literalmente:

> *Trusted Web Activity is available in **Chrome on Android**, version 72 and above.*

A Android TV não tem Chrome — não vem de fábrica e a Play Store de TV não o distribui. O APK do
PWABuilder só rodaria depois de sideloar um Chrome de celular na TV, e torcer para ele obedecer
ao controle remoto.

A `WebView`, ao contrário, é **componente do sistema**: existe em qualquer aparelho Android, TV
inclusive, sem depender de navegador instalado. E ela deixa o app controlar o que importa numa
TV: foco, tela cheia, tela sempre ligada e o botão voltar.

---

## Como construir

Precisa de JDK 17 e do Android SDK (`platforms;android-34`, `build-tools;34.0.0`).

```bash
export JAVA_HOME=/caminho/para/jdk17
export ANDROID_HOME=/caminho/para/android-sdk

cd tv
./gradlew assembleDebug        # APK de teste, assinado com a chave de debug
```

O APK sai em `app/build/outputs/apk/debug/app-debug.apk`.

Para apontar para outro endereço, sem editar código:

```bash
./gradlew assembleDebug -PurlPainel=https://outro.dominio/panel
```

### APK de release, assinado

O keystore é segredo e **não vai para o repositório** (veja o `.gitignore`). Gere o seu uma vez:

```bash
keytool -genkeypair -v -keystore houseworks-tv.jks -alias houseworks \
  -keyalg RSA -keysize 2048 -validity 10000
```

Guarde esse arquivo e a senha **fora do repositório e com backup**: quem tem o keystore publica
atualização em nome do app; quem perde, não consegue nem instalar por cima da versão anterior.

---

## Como instalar na TV

**Pela rede, com `adb`** — o caminho que dá para repetir:

```bash
# Na TV: Configurações -> Sobre -> clicar 7x em Compilação (libera o modo desenvolvedor)
#        Configurações -> Preferências do dispositivo -> Depuração -> Depuração por rede: ligar
adb connect 192.168.0.10:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Por pendrive**: copie o APK, abra num gerenciador de arquivos na TV e autorize a instalação de
fontes desconhecidas. Funciona, mas exige um gerenciador de arquivos instalado.

Depois de instalado, o app aparece na fileira de apps da TV — é o `LEANBACK_LAUNCHER` no manifest.

---

## O que o app faz sozinho

| Comportamento | Por quê |
|---|---|
| Tela cheia imersiva | TV de parede não tem barra de status para mostrar |
| Tela sempre ligada | O painel existe para ser visto o dia inteiro |
| Recarrega a cada 15 min | O placar muda pelo celular de quem faz; sem isso a TV mostra a manhã à noite |
| Recarrega ao voltar, se ficou fora mais de 5 min | Ligar a TV não pode mostrar o dia de ontem |
| Aviso nativo quando a rede cai | Uma página de erro dentro da WebView não carregaria — foi a rede que caiu |
| Botão voltar anda no histórico | Sem histórico, fecha o app: é o único jeito de sair só com o controle |

**A navegação por D-pad é do painel, não do app.** As setas são entregues à página, onde
`lib/device/spatial.ts` decide para onde o foco vai. O app só garante que a WebView tenha o foco
para receber as teclas.

---

## Pré-requisito que não é óbvio

**A sessão precisa durar.** Um app de TV que pede login a cada hora é inútil: digitar e-mail e
senha com o controle remoto não é aceitável. O token da API dura 1 hora, mas a sessão dura 30
dias e o `middleware.ts` do front renova antes do render. Sem isso, o app abriria na tela de login
todo dia.

Se a TV pedir login com frequência, o problema está aí, não no app: confira `API_INTERNAL_URL` no
container do front (ver `docs/DEPLOY.md`).

---

## Arte

O ícone e o banner são **gerados**, não desenhados à mão:

```bash
cd ../frontend && npm run gen:icons
```

Isso escreve o ícone do PWA, os cinco tamanhos de ícone do app de TV e o banner 320x180 — formato
fixo exigido pelo launcher da TV. Sem `android:banner` o app não aparece direito na fileira.
