// app/build.gradle.kts

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

// O endereco do painel vem de fora, com um padrao que funciona:
//
//   ./gradlew assembleDebug -PurlPainel=https://outro.dominio/panel
//
// Assim nao ha URL escrita no codigo para alguem esquecer de trocar — e o mesmo motivo de o
// front embutir NEXT_PUBLIC_API_BASE_URL em tempo de build.
val urlPainel: String = (project.findProperty("urlPainel") as String?)
  ?: "https://tasks.rodrigo.inf.br/panel"

android {
  namespace = "br.inf.rodrigo.houseworks.tv"
  compileSdk = 34

  defaultConfig {
    applicationId = "br.inf.rodrigo.houseworks.tv"
    // 21 (Android 5) cobre qualquer TV que ainda receba atualizacao. Nada aqui usa API nova:
    // e uma WebView em tela cheia.
    minSdk = 21
    targetSdk = 34
    versionCode = 1
    versionName = "1.0"

    buildConfigField("String", "URL_PAINEL", "\"" + urlPainel + "\"")
  }

  buildFeatures {
    // Necessario desde o AGP 8 para o buildConfigField acima existir.
    buildConfig = true
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      // A assinatura NAO fica aqui. O keystore e segredo e nao entra no repositorio:
      // veja o README para gerar o seu e apontar por variavel de ambiente.
      signingConfig = null
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}
