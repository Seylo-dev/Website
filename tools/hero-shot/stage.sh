#!/usr/bin/env bash
# Stages demo data on a running Seylo panel with three joined nodes, through the panel's REST API only:
# three projects (storefront, analytics, docs) with light images that really run, and Python services
# that put smooth CPU, memory and network load on the nodes so the dashboard graphs have curves.
#
#   PANEL=http://192.168.64.3:3000 API_KEY_FILE=~/.cache/seylo-e2e/state/api-key \
#   NODE_NAMES="fra-1 ams-1 nyc-1" ./stage.sh
#
# The nodes must already have those names (nodes.rename). Peers reach each other on the first-run
# IP:port, so NODE_IPS lists the node addresses in the same order as NODE_NAMES.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
PANEL=${PANEL:-http://192.168.64.3:3000}
KEY=$(cat "${API_KEY_FILE:-$HOME/.cache/seylo-e2e/state/api-key}")
read -r -a NAMES <<<"${NODE_NAMES:-fra-1 ams-1 nyc-1}"
read -r -a IPS <<<"${NODE_IPS:-192.168.64.3 192.168.64.4 192.168.64.5}"
SCRIPT=$(cat "$HERE/demo-load.py")
PY=python:3.13-alpine
WEB=nginx:1.27-alpine
NL=$'\n'

api() { # api <op> <json> - POST, prints the body, fails on non-2xx
  local out code
  out=$(mktemp)
  code=$(curl -sS -m 300 -o "$out" -w '%{http_code}' -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
    -X POST --data "$2" "$PANEL/api/v1/$1")
  if [ "${code:0:1}" != 2 ]; then echo "api $1 -> $code $(head -c 400 "$out")" >&2; rm -f "$out"; return 1; fi
  cat "$out"; rm -f "$out"
}
get() { curl -fsS -m 60 -H "authorization: Bearer $KEY" "$PANEL/api/v1/$1?$2"; }

node_id() { get nodes.list "" | jq -r --arg n "$1" '.nodes[] | select(.name==$n) | .id'; }
project() { # project <name> <description> - creates it unless it exists, prints the id
  local id
  id=$(get projects.list "" | jq -r --arg n "$1" '.projects[] | select(.name==$n) | .id')
  [ -n "$id" ] || id=$(api projects.create "$(jq -nc --arg n "$1" --arg d "$2" '{name:$n, description:$d}')" | jq -r '.project.id // .id')
  echo "$id"
}
existing() { get services.list "projectId=$1" | jq -r --arg n "$2" '.services[] | select(.name==$n) | .id'; }
image() { # image <project> <name> <node> <image> <port|""> [command json] - prints the service id
  local ports='[]' id
  id=$(existing "$1" "$2")
  if [ -n "$id" ]; then echo "$id"; return; fi
  [ -z "$5" ] || ports="[{\"containerPort\":$5,\"protocol\":\"tcp\"}]"
  id=$(api services.create "$(jq -nc --arg p "$1" --arg n "$2" --arg node "$3" --arg img "$4" --argjson ports "$ports" \
    '{projectId:$p, name:$n, kind:"app", nodeId:$node, source:{type:"image", image:$img, registryId:null}, ports:$ports, deployNow:false}')" |
    jq -r '.service.id // .id')
  [ -z "${6:-}" ] || api services.update "$(jq -nc --arg id "$id" --argjson c "$6" '{serviceId:$id, container:{command:$c}}')" >/dev/null
  echo "$id"
}
pyload() { # pyload <project> <name> <node> <port|""> <env> - a Python service running demo-load.py
  local id peer
  id=$(image "$1" "$2" "$3" "$PY" "$4" "$(jq -nc --arg s "$SCRIPT" '["python", "-u", "-c", $s]')")
  # On a rerun keep the PEER line, so the service is not redeployed twice.
  peer=$(get env.get "serviceId=$id" | jq -r '.text // empty' | grep '^PEER=' || true)
  api env.set "$(jq -nc --arg id "$id" --arg t "$5${peer:+$NL$peer}" '{serviceId:$id, text:$t}')" >/dev/null
  echo "$id"
}
db() { [ -z "$(existing "$1" "$2")" ] || return 0; api databases.create "$(jq -nc --arg p "$1" --arg n "$2" --arg e "$3" --arg v "$4" --arg node "$5" \
  '{projectId:$p, name:$n, engine:$e, version:$v, nodeId:$node}')" | jq -r '.serviceId // .service.id'; }
tpl() { [ -z "$(existing "$1" "$3")" ] || return 0; api templates.create "$(jq -nc --arg p "$1" --arg s "$2" --arg n "$3" --arg node "$4" \
  '{projectId:$p, slug:$s, name:$n, nodeId:$node, values:{}, deployNow:true}')" >/dev/null; }
deploy() { api deployments.deploy "{\"serviceId\":\"$1\"}" >/dev/null; }
port_of() { get exposures.get "serviceId=$1" | jq -r '.firstRun.address // empty' | sed 's/.*://'; }

FRA=$(node_id "${NAMES[0]}") AMS=$(node_id "${NAMES[1]}") NYC=$(node_id "${NAMES[2]}")
[ -n "$FRA" ] && [ -n "$AMS" ] && [ -n "$NYC" ] || { echo "nodes ${NAMES[*]} not found" >&2; exit 1; }

store=$(project storefront "Shop front end, API and background jobs")
stats=$(project analytics "Event collection and dashboards")
docs=$(project docs "Public documentation site")

# storefront on the first node
web=$(image "$store" web "$FRA" "$WEB" 80)
apisvc=$(pyload "$store" api "$FRA" 8080 $'PROCS=1\nCPU=0.22\nAMP=0.14\nPERIOD=540\nMEM=200\nMEMAMP=30\nNET=120')
worker=$(pyload "$store" worker "$FRA" "" $'PROCS=2\nCPU=0.28\nAMP=0.2\nPERIOD=780\nMEM=1100\nMEMAMP=120\nNET=80')
db "$store" postgres postgres 17 "$FRA" >/dev/null
db "$store" redis redis 7.4 "$FRA" >/dev/null

# analytics on the second node
collector=$(pyload "$stats" collector "$AMS" 8080 $'PROCS=2\nCPU=0.45\nAMP=0.25\nPERIOD=660\nMEM=1300\nMEMAMP=140\nNET=500')
db "$stats" postgres postgres 17 "$AMS" >/dev/null
tpl "$stats" grafana grafana "$AMS"

# docs on the third node
site=$(image "$docs" site "$NYC" "$WEB" 80)
og=$(pyload "$docs" og-images "$NYC" 8080 $'PROCS=1\nCPU=0.2\nAMP=0.15\nPERIOD=480\nMEM=320\nMEMAMP=60\nNET=350')
tpl "$docs" meilisearch search "$NYC"

for id in "$web" "$apisvc" "$worker" "$collector" "$site" "$og"; do deploy "$id"; done

# Wire the network load once the first-run ports exist: each Python service pulls bytes from a peer
# on another node, so every node's physical interface carries traffic.
echo "waiting for first-run ports..."
for _ in $(seq 1 60); do
  pa=$(port_of "$apisvc") pc=$(port_of "$collector") po=$(port_of "$og")
  [ -n "$pa" ] && [ -n "$pc" ] && [ -n "$po" ] && break
  sleep 5
done
[ -n "$pa" ] && [ -n "$pc" ] && [ -n "$po" ] || { echo "no first-run ports (api=$pa collector=$pc og=$po)" >&2; exit 1; }
peer() { # peer <service> <url> - set PEER in the service env and redeploy, unless it is already set
  local text
  text=$(get env.get "serviceId=$1" | jq -r '.text // empty')
  ! grep -qxF "PEER=$2" <<<"$text" || return 0
  text=$(grep -v '^PEER=' <<<"$text" || true)
  api env.set "$(jq -nc --arg id "$1" --arg t "$text${NL}PEER=$2" '{serviceId:$id, text:$t}')" >/dev/null
  deploy "$1"
}
peer "$apisvc" "http://${IPS[2]}:$po/blob"
peer "$worker" "http://${IPS[1]}:$pc/blob"
peer "$collector" "http://${IPS[0]}:$pa/blob"
peer "$og" "http://${IPS[1]}:$pc/blob"
# The protected Panel project goes last (below the fold of the shot) and collapsed in the sidebar.
panelp=$(get projects.list "" | jq -r '.projects[] | select(.name=="Panel") | .id')
order=$(jq -nc --arg a "$store" --arg b "$stats" --arg c "$docs" --arg d "$panelp" '[$a, $b, $c, $d] | map(select(. != ""))')
api projects.reorder "{\"projectIds\":$order}" >/dev/null
[ -z "$panelp" ] || api projects.setCollapsed "{\"projectId\":\"$panelp\",\"collapsed\":true}" >/dev/null
echo "staged: storefront=$store analytics=$stats docs=$docs"
