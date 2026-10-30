#!/bin/sh
# Identité de déploiement pour GitHub Actions → API de Séoul (func-shukatsu-ijdqobb4nlsxu).
#
# OIDC, sans secret : GitHub prouve à Azure qu'il s'agit d'un workflow de la branche main de
# simondepussay/shukatsu-pilot, et rien d'autre ne peut l'utiliser. Un seul droit :
# « Website Contributor » sur cette Function App (déployer le code), pas sur le reste de l'abonnement.
#
# À lancer une fois, par le propriétaire de l'abonnement :   sh infra/github-deploy-identity.sh
set -e
GROUP=rg-shukatsu-pilot
FUNC=func-shukatsu-ijdqobb4nlsxu
REPO=simondepussay/shukatsu-pilot

APP=$(az ad app create --display-name "github-cleanwork-deploy-korea" --query appId -o tsv)
az ad sp create --id "$APP" -o none 2>/dev/null || true

FIC=$(mktemp)
cat > "$FIC" <<EOF
{"name":"github-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:$REPO:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"],"description":"Déploiement de l'API de Séoul depuis main"}
EOF
az ad app federated-credential create --id "$APP" --parameters "@$FIC" -o none
# Ce dépôt reçoit de GitHub le format « avec identifiants » (repo:compte@id/dépôt@id:…) : on l'accepte aussi.
OWNER_ID=$(gh api "repos/$REPO" -q .owner.id)
REPO_ID=$(gh api "repos/$REPO" -q .id)
cat > "$FIC" <<EOF
{"name":"github-main-ids","issuer":"https://token.actions.githubusercontent.com","subject":"repo:${REPO%%/*}@$OWNER_ID/${REPO##*/}@$REPO_ID:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"],"description":"GitHub (format avec identifiants) : main seulement"}
EOF
az ad app federated-credential create --id "$APP" --parameters "@$FIC" -o none
rm -f "$FIC"

# L'identité met quelques secondes à être visible pour l'attribution du rôle.
sleep 20
az role assignment create --assignee "$APP" --role "Website Contributor" \
  --scope "$(az functionapp show -n $FUNC -g $GROUP --query id -o tsv)" -o none

gh secret set AZURE_CLIENT_ID -b "$APP" -R "$REPO"
gh secret set AZURE_TENANT_ID -b "$(az account show --query tenantId -o tsv)" -R "$REPO"
gh secret set AZURE_SUBSCRIPTION_ID -b "$(az account show --query id -o tsv)" -R "$REPO"
echo "Identité de déploiement prête : GitHub peut déployer l'API de Séoul."
