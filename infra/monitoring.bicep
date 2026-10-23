// Surveillance (S21) : journaux, erreurs et temps de réponse de l'API dans Application Insights,
// et une alerte par email quand l'API renvoie des erreurs.
// Déployé à part de main.bicep, pour ne pas toucher aux ressources de production :
//
//   az deployment group create -g rg-shukatsu-pilot -f infra/monitoring.bicep -p alertEmail=…
//
// Puis infra/settings.mjs relie l'API à Application Insights (APPLICATIONINSIGHTS_CONNECTION_STRING).

param location string = 'koreacentral'
param suffix string = uniqueString(resourceGroup().id)

@description('Adresse qui reçoit les alertes')
param alertEmail string

var tags = { project: 'shukatsu-pilot' }

// Espace de journaux : 30 jours de conservation (annoncé dans la politique de confidentialité),
// et un plafond de 0,1 Go par jour pour rester très loin des 5 Go gratuits par mois.
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-shukatsu-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.1') }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-shukatsu-${suffix}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    // Les adresses IP sont masquées (0.0.0.0) : on n'en a pas besoin pour corriger une erreur.
    DisableIpMasking: false
    RetentionInDays: 30
  }
}

resource team 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-shukatsu-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'shukatsu'
    enabled: true
    emailReceivers: [ { name: 'developpeur', emailAddress: alertEmail, useCommonAlertSchema: true } ]
  }
}

// Alerte « métrique » (quelques centimes par mois, contrairement aux alertes sur requête de journaux) :
// plus de 5 requêtes en échec (HTTP 5xx) en 15 minutes.
resource failures 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-api-failures-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    description: 'L\'API renvoie des erreurs 5xx'
    severity: 2
    enabled: true
    scopes: [ insights.id ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'failed'
          criterionType: 'StaticThresholdCriterion'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'requests/failed'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Count'
        }
      ]
    }
    actions: [ { actionGroupId: team.id } ]
  }
}

output insightsName string = insights.name
