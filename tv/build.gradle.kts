// build.gradle.kts (raiz)
//
// `apply false`: os plugins ficam declarados aqui, com a VERSAO, e cada modulo decide se
// aplica. Centralizar a versao evita que app/ e um futuro modulo compilando/divirjam.

plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
