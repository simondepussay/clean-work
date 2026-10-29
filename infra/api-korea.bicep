// API de Clean Work en Corée Centre (Séoul), à côté de Cosmos DB et d'Azure OpenAI.
//
// Pourquoi : l'API intégrée à Static Web Apps tourne à Hong Kong (seule région du service en Asie),
// alors que les données sont à Séoul ; chaque appel faisait Tokyo → Hong Kong → Séoul → retour.
// Le Japon est exclu par la politique de l'abonnement (Azure for Students : sys.regionrestriction).
//
// Function App « Flex Consumption » : facturée à l'usage, avec un quota mensuel gratuit.
// Les réglages (Cosmos, annuaire, IA, APNs…) ne sont PAS ici : infra/api-korea-settings.mjs les recopie
// depuis Static Web Apps sans les afficher (un bloc appsettings ici les écraserait à chaque déploiement).
//
// Déploiement : az deployment group create -g rg-shukatsu-pilot -f infra/api-korea.bicep

@description('Région de l\'API (la plus proche du Japon parmi celles autorisées)')
param location string = 'koreacentral'

@description('Suffixe unique pour les noms globaux (le même que main.bicep)')
param suffix string = uniqueString(resourceGroup().id)

@description('Seuls ces sites peuvent appeler l\'API depuis un navigateur (CORS)')
param allowedOrigins array = [
  'https://cleanwork.simondepussay.com'
  'https://blue-rock-008b52800.2.azurestaticapps.net'
]

var tags = { project: 'shukatsu-pilot' }

// Stockage de l'hôte Functions et des paquets de déploiement : sans clé partagée (identité de l'app).
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stshukatsu${take(suffix, 12)}'
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deployments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'deployments'
  properties: { publicAccess: 'None' }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-shukatsu-api-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

resource api 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-shukatsu-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      cors: { allowedOrigins: allowedOrigins, supportCredentials: false }
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}deployments'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      // Au plus 10 instances : de quoi absorber un pic, sans facture surprise.
      scaleAndConcurrency: { maximumInstanceCount: 10, instanceMemoryMB: 2048 }
      runtime: { name: 'node', version: '22' }
    }
  }
}

// L'app lit et écrit son stockage avec son identité (Blob : paquets et hôte ; Queue et Table : hôte Functions).
var roles = [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Storage Table Data Contributor
]
resource storageRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for role in roles: {
  name: guid(storage.id, api.id, role)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}]

output apiName string = api.name
output apiHostname string = api.properties.defaultHostName
output storageName string = storage.name
