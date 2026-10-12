// MainActivity.kt
//
// O app inteiro: uma WebView em tela cheia apontando para o painel.
//
// POR QUE WEBVIEW E NAO TWA (Trusted Web Activity). O TWA nao e um app: e uma casca que abre
// o Chrome do aparelho. A documentacao do Chrome e explicita — "Trusted Web Activity is
// available in Chrome on Android" — e Android TV nao tem Chrome: ele nao vem de fabrica e a
// Play Store de TV nao o distribui. A WebView, ao contrario, e componente do SISTEMA: existe
// em qualquer aparelho Android, TV inclusive, sem depender de navegador instalado.

package br.inf.rodrigo.houseworks.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button

class MainActivity : Activity() {

  private lateinit var web: WebView
  private lateinit var erro: View

  /**
   * Recarga periodica.
   *
   * Um painel de parede que fica ligado o dia inteiro mostraria a manha inteira o que a casa
   * ja concluiu — o placar e a lista sao atualizados pelo celular de quem faz. Quinze minutos
   * e o meio-termo entre ficar atual e recarregar a toa.
   */
  private val intervaloDeRecarga = 15 * 60 * 1000L

  /**
   * Ao voltar para a frente, recarrega se a TV ficou desligada/noutro app por mais que isto.
   *
   * Sem o piso, toda troca de app no controle ja forcaria uma recarga — e o painel voltaria ao
   * topo sem necessidade.
   */
  private val recarregarSeAusentePor = 5 * 60 * 1000L

  private val relogio = Handler(Looper.getMainLooper())
  private var pausadoEm = 0L
  private var carregou = false

  private val recargaAgendada = object : Runnable {
    override fun run() {
      web.reload()
      agendarRecarga()
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(estado: Bundle?) {
    super.onCreate(estado)
    setContentView(R.layout.activity_main)

    // TV de parede fica ligada o dia inteiro: a tela nao pode apagar sozinha.
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    web = findViewById(R.id.web)
    erro = findViewById(R.id.erro)

    val ajustes = web.settings
    // O painel e uma aplicacao Next.js: sem JavaScript nao ha nada para mostrar.
    ajustes.javaScriptEnabled = true
    // Guarda a sessao e o estado local. Sem isto, o login se perderia a cada abertura.
    ajustes.domStorageEnabled = true
    // O painel nao tem zoom — nao ha gesto de pinca num controle remoto.
    ajustes.setSupportZoom(false)
    ajustes.builtInZoomControls = false
    // Se algum dia o painel tiver audio, ele nao deve esperar um toque que nunca vem.
    ajustes.mediaPlaybackRequiresUserGesture = false
    // Recarrega do servidor em vez de servir cache: dado de tarefa velho e pior que ausente,
    // pela mesma razao que o service worker do PWA nao cacheia resposta de API.
    ajustes.cacheMode = WebSettings.LOAD_DEFAULT

    // Fundo preto enquanto a pagina nao pinta: a tela clara por um instante numa sala escura
    // incomoda mais do que parece.
    web.setBackgroundColor(Color.BLACK)

    web.webViewClient = objetoDoCliente()
    // Uma WebView sem WebChromeClient ignora pedidos que a pagina faz (alert, fullscreen).
    // Nao usamos nenhum hoje, mas deixar de fora e o tipo de coisa que so aparece depois.
    web.webChromeClient = WebChromeClient()

    // O foco precisa estar NA WebView para as setas do controle chegarem a pagina, onde a
    // navegacao espacial (lib/device/spatial.ts, no front) as recebe.
    web.isFocusable = true
    web.isFocusableInTouchMode = true
    web.requestFocus()

    findViewById<Button>(R.id.tentar_de_novo).setOnClickListener {
      erro.visibility = View.GONE
      web.visibility = View.VISIBLE
      carregar()
    }

    carregar()
    agendarRecarga()
  }

  private fun carregar() {
    web.loadUrl(BuildConfig.URL_PAINEL)
  }

  private fun agendarRecarga() {
    relogio.removeCallbacks(recargaAgendada)
    relogio.postDelayed(recargaAgendada, intervaloDeRecarga)
  }

  /**
   * O erro de rede precisa de um aviso NATIVO.
   *
   * Nao da para carregar uma pagina de erro dentro da propria WebView: se a rede caiu, ela nao
   * consegue carregar nem a mensagem. Foi por isso que o aviso virou uma View sobreposta.
   */
  @Suppress("DEPRECATION")
  private fun objetoDoCliente() = object : WebViewClient() {

    override fun onPageFinished(view: WebView?, url: String?) {
      super.onPageFinished(view, url)
      carregou = true
      // O foco pode ter ido para outro lugar durante o carregamento; devolve-lo a WebView e o
      // que faz o controle remoto voltar a funcionar depois de uma recarga.
      web.requestFocus()
    }

    override fun onReceivedError(
      view: WebView?,
      request: WebResourceRequest?,
      error: WebResourceError?,
    ) {
      // Só o documento principal: um icone que falhou nao pode cobrir o painel inteiro.
      if (request != null && request.isForMainFrame) mostrarErro()
    }

    // Assinatura antiga, mantida para aparelhos abaixo da API 23 — onde a nova nem chega a
    // ser chamada. O aviso de "sobrescreve membro obsoleto" e esperado e proposital:
    // remove-la quebraria a deteccao de erro justamente nas TVs mais antigas.
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onReceivedError(
      view: WebView?,
      errorCode: Int,
      description: String?,
      failingUrl: String?,
    ) {
      mostrarErro()
    }

    // Mantem TUDO dentro da WebView: uma URL externa abriria o navegador e tiraria a TV do
    // painel, sem caminho de volta pelo controle.
    override fun shouldOverrideUrlLoading(
      view: WebView?,
      request: WebResourceRequest?,
    ): Boolean = false
  }

  private fun mostrarErro() {
    web.visibility = View.GONE
    erro.visibility = View.VISIBLE
    // O foco vai para o botao: sem isto, o "Tentar de novo" estaria na tela e fora do alcance
    // do controle remoto.
    findViewById<Button>(R.id.tentar_de_novo).requestFocus()
  }

  /**
   * Tela cheia de verdade, inclusive escondendo as barras do sistema.
   *
   * IMMERSIVE_STICKY faz as barras voltarem sozinhas se aparecerem, em vez de exigir um gesto
   * que ninguem vai fazer com um controle remoto na mao.
   */
  @Suppress("DEPRECATION")
  private fun modoTelaCheia() {
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_FULLSCREEN
        or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      )
  }

  override fun onResume() {
    super.onResume()
    modoTelaCheia()
    web.onResume()

    // Voltou depois de um tempo fora: recarrega, para nao exibir o dia de ontem.
    if (carregou && pausadoEm > 0 &&
      System.currentTimeMillis() - pausadoEm > recarregarSeAusentePor
    ) {
      web.reload()
    }

    agendarRecarga()
  }

  override fun onPause() {
    super.onPause()
    pausadoEm = System.currentTimeMillis()
    // Para os timers da pagina enquanto a TV esta noutro app.
    web.onPause()
    relogio.removeCallbacks(recargaAgendada)
  }

  override fun onDestroy() {
    relogio.removeCallbacks(recargaAgendada)
    super.onDestroy()
  }

  /**
   * O botao voltar.
   *
   * Dentro do painel ele anda no historico; sem historico, fecha o app — que e o unico jeito
   * de sair usando so o controle remoto.
   */
  override fun onKeyDown(keyCode: Int, evento: KeyEvent): Boolean {
    if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
      web.goBack()
      return true
    }

    return super.onKeyDown(keyCode, evento)
  }
}
