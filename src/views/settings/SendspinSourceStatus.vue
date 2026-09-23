<template>
  <Card class="mb-4" data-testid="sendspin-source-status">
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
            </dl>
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
import { onMounted, ref } from "vue";

interface SourceStatus {
  target_latency_ms: number;
  sources: {
    client_id: string;
    name: string;
    signal: string | null;
    selected_player_id: string | null;
    receiving_pcm: boolean;
    last_pcm_age_ms: number | null;
  }[];
}

const status = ref<SourceStatus>();
const error = ref("");
const loading = ref(false);

function playerName(playerId: string) {
  return api.players[playerId]?.name ?? playerId;
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    status.value = await api.sendCommand<SourceStatus>(
      "sendspin_source/status",
    );
  } catch (err) {
    status.value = undefined;
    error.value = String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => void refresh());
</script>
