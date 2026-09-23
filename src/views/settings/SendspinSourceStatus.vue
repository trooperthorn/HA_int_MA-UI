<template>
  <Card v-if="available" class="mb-4" data-testid="sendspin-source-status">
    <CardHeader>
      <CardTitle>{{ $t("settings.sendspin_source_status.title") }}</CardTitle>
      <CardDescription>{{
        $t("settings.sendspin_source_status.description")
      }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="loading" role="status">
        {{ $t("settings.sendspin_source_status.loading") }}
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive">
        {{ $t("settings.sendspin_source_status.unavailable") }} {{ error }}
      </p>
      <template v-if="status">
        <p class="text-sm">
          {{ $t("settings.sendspin_source_status.target_latency") }}:
          {{ status.target_latency_ms }} ms
        </p>
        <p v-if="!status.sources.length" class="text-sm text-muted-foreground">
          {{ $t("settings.sendspin_source_status.none") }}
        </p>
        <ul v-else class="space-y-3">
          <li
            v-for="source in status.sources"
            :key="source.client_id"
            class="rounded-md border p-3 text-sm"
          >
            <div class="font-medium">{{ source.name }}</div>
            <div class="break-all text-xs text-muted-foreground">
              {{ source.client_id }}
            </div>
            <dl class="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <dt class="font-medium">
                  {{ $t("settings.sendspin_source_status.signal") }}
                </dt>
                <dd>
                  {{
                    source.signal ??
                    $t("settings.sendspin_source_status.unknown")
                  }}
                </dd>
              </div>
              <div>
                <dt class="font-medium">
                  {{ $t("settings.sendspin_source_status.destination") }}
                </dt>
                <dd>
                  {{
                    source.selected_player_id
                      ? playerName(source.selected_player_id)
                      : $t("settings.sendspin_source_status.none_selected")
                  }}
                </dd>
              </div>
              <div>
                <dt class="font-medium">
                  {{ $t("settings.sendspin_source_status.pcm") }}
                </dt>
                <dd>
                  {{
                    source.receiving_pcm
                      ? $t("settings.sendspin_source_status.receiving")
                      : $t("settings.sendspin_source_status.idle")
                  }}
                </dd>
              </div>
              <div v-if="source.last_pcm_age_ms !== null">
                <dt class="font-medium">
                  {{ $t("settings.sendspin_source_status.last_pcm") }}
                </dt>
                <dd>{{ source.last_pcm_age_ms }} ms</dd>
              </div>
              <div v-if="source.bridge_buffer_ms != null">
                <dt class="font-medium">
                  {{ $t("settings.sendspin_source_status.bridge_buffer") }}
                </dt>
                <dd>{{ source.bridge_buffer_ms }} ms</dd>
              </div>
            </dl>
            <p
              v-if="source.bridge_buffer_ms != null"
              class="mt-2 text-xs text-muted-foreground"
            >
              {{ $t("settings.sendspin_source_status.bridge_buffer_hint") }}
            </p>
            <div class="mt-3 flex flex-wrap items-end gap-2">
              <label class="min-w-48 flex-1 text-xs">
                {{ $t("settings.sendspin_source_status.route_to") }}
                <select
                  v-model="destinations[source.client_id]"
                  :aria-label="$t('settings.sendspin_source_status.route_to')"
                  class="border-input bg-background mt-1 w-full rounded-md border px-2 py-2 text-sm"
                >
                  <option value="">
                    {{ $t("settings.sendspin_source_status.choose_player") }}
                  </option>
                  <option
                    v-for="player in audioPlayers"
                    :key="player.player_id"
                    :value="player.player_id"
                  >
                    {{ player.name }}
                  </option>
                </select>
              </label>
              <Button
                :disabled="
                  !destinations[source.client_id] || busy === source.client_id
                "
                @click="startSource(source)"
              >
                {{ $t("settings.sendspin_source_status.start") }}
              </Button>
              <Button
                v-if="source.playback_session_id"
                variant="outline"
                :disabled="busy === source.client_id"
                @click="stopSource(source)"
              >
                {{ $t("settings.sendspin_source_status.stop") }}
              </Button>
            </div>
            <p
              v-if="actionErrors[source.client_id]"
              role="alert"
              class="mt-2 text-destructive"
            >
              {{ actionErrors[source.client_id] }}
            </p>
          </li>
        </ul>
      </template>
      <Button variant="outline" :disabled="loading" @click="refresh">
        {{ $t("settings.sendspin_source_status.refresh") }}
      </Button>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/plugins/api";
import { isSelectablePlayer } from "@/helpers/players";
import { QueueOption } from "@/plugins/api/interfaces";
import { computed, onMounted, reactive, ref } from "vue";

interface SourceStatus {
  api_version: number;
  target_latency_ms: number;
  sources: {
    client_id: string;
    name: string;
    source_uri: string;
    signal: string | null;
    selected_player_id: string | null;
    owner_player_id: string | null;
    playback_session_id: string | null;
    receiving_pcm: boolean;
    last_pcm_age_ms: number | null;
    bridge_buffer_ms?: number | null;
  }[];
}

const status = ref<SourceStatus>();
const available = ref(false);
const error = ref("");
const loading = ref(false);
const busy = ref<string>();
const destinations = reactive<Record<string, string>>({});
const actionErrors = reactive<Record<string, string>>({});
const audioPlayers = computed(() =>
  Object.values(api.players)
    .filter(isSelectablePlayer)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

type Source = SourceStatus["sources"][number];

function playerName(playerId: string) {
  return api.players[playerId]?.name ?? playerId;
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.sendCommand<SourceStatus>(
      "sendspin_source/status",
      undefined,
      { suppressGlobalError: true },
    );
    if (response.api_version !== 1) {
      available.value = false;
      status.value = undefined;
      return;
    }
    available.value = true;
    status.value = response;
    for (const source of status.value.sources) {
      destinations[source.client_id] ||= source.owner_player_id ?? "";
    }
  } catch (err) {
    status.value = undefined;
    error.value = String(err);
  } finally {
    loading.value = false;
  }
}

async function startSource(source: Source) {
  const queueId = destinations[source.client_id];
  if (!queueId || !isSelectablePlayer(api.players[queueId])) return;
  busy.value = source.client_id;
  actionErrors[source.client_id] = "";
  try {
    await api.playMedia(source.source_uri, QueueOption.PLAY, {
      queue_id: queueId,
    });
    await refresh();
  } catch (err) {
    actionErrors[source.client_id] = String(err);
  } finally {
    busy.value = undefined;
  }
}

async function stopSource(source: Source) {
  if (!source.playback_session_id) return;
  busy.value = source.client_id;
  actionErrors[source.client_id] = "";
  try {
    await api.sendCommand("sendspin_source/stop", {
      client_id: source.client_id,
      playback_session_id: source.playback_session_id,
    });
    await refresh();
  } catch (err) {
    actionErrors[source.client_id] = String(err);
  } finally {
    busy.value = undefined;
  }
}

onMounted(() => void refresh());
</script>
