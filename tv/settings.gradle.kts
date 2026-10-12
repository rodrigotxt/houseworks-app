// settings.gradle.kts
//
// pluginManagement e dependencyResolutionManagement declarados aqui (e nao no build raiz)
// porque o Gradle 7+ exige que os repositorios de PLUGIN sejam resolvidos antes de qualquer
// coisa ser avaliada — sem isso o build falha reclamando de repositorio desconhecido.

pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "HouseWorksTV"
include(":app")
