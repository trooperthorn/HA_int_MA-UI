<template>
  <Card class="mb-4" data-testid="sendspin-discovery-status">
    <CardHeader>
      <CardTitle>{{ $t("settings.sendspin_discovery.title") }}</CardTitle>
      <CardDescription>{{
        $t("settings.sendspin_discovery.description")
      }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="loading" role="status">
        {{ $t("settings.sendspin_discovery.loading") }}
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive">
        {{ $t("settings.sendspin_discovery.unavailable") }} {{ error }}
      </p>
      <template v-if="status">
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="font-medium">
              {{ $t("settings.sendspin_discovery.listener") }}
            </dt>
            <dd>
              {{ stateLabel(status.listener_active) }} ·
              {{ status.listen_address }}:{{ status.port }}
            </dd>
          </div>
          <div>
            <dt class="font-medium">
              {{ $t("settings.sendspin_discovery.advertising") }}
            </dt>
            <dd>
              {{ stateLabel(status.advertising_active) }} ·
              {{ status.advertise_address }}
            </dd>
          </div>
          <div>
            <dt class="font-medium">
              {{ $t("settings.sendspin_discovery.discovery") }}
            </dt>
            <dd>{{ stateLabel(status.client_discovery_active) }}</dd>
          </div>
          <div>
            <dt class="font-medium">
              {{ $t("settings.sendspin_discovery.clients") }}
            </dt>
            <dd>{{ status.connected_clients }} / {{ status.known_clients }}</dd>
          </div>
          <div>
            <dt class="font-medium">
              {{ $t("settings.sendspin_discovery.legacy") }}
            </dt>
            <dd>{{ stateLabel(status.legacy_clients_allowed) }}</dd>
          </div>
        </dl>
        <section>
          <h3 class="text-sm font-medium">
            {{ $t("settings.sendspin_discovery.manual") }}
          </h3>
          <p
            v-if="!status.manual_addresses.length"
            class="text-sm text-muted-foreground"
          >
            {{ $t("settings.sendspin_discovery.none") }}
          </p>
          <ul v-else class="list-inside list-disc break-all text-sm">
            <li v-for="entry in status.manual_addresses" :key="entry.address">
              {{ entry.address }} ·
              {{
                entry.valid
                  ? $t("settings.sendspin_discovery.valid")
                  : $t("settings.sendspin_discovery.invalid")
              }}
            </li>
          </ul>
        </section>
        <section>
          <h3 class="text-sm font-medium">
            {{ $t("settings.sendspin_discovery.services") }}
          </h3>
          <p
            v-if="!status.discovered_services.length"
            class="text-sm text-muted-foreground"
          >
            {{ $t("settings.sendspin_discovery.none") }}
          </p>
          <ul v-else class="list-inside list-disc break-all text-sm">
            <li v-for="entry in status.discovered_services" :key="entry.name">
              {{ entry.name }} · {{ entry.url }}
            </li>
          </ul>
        </section>
      </template>
      <Button variant="outline" :disabled="loading" @click="refresh">
        {{ $t("settings.sendspin_discovery.refresh") }}
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
import { useI18n } from "vue-i18n";

interface DiscoveryStatus {
  listener_active: boolean;
  listen_address: string;
  port: number;
  advertising_active: boolean;
  advertise_address: string;
  client_discovery_active: boolean;
  discovered_services: { name: string; url: string }[];
  manual_addresses: { address: string; valid: boolean }[];
  known_clients: number;
  connected_clients: number;
  legacy_clients_allowed: boolean;
}

const { t } = useI18n();
const status = ref<DiscoveryStatus>();
const error = ref("");
const loading = ref(false);

function stateLabel(value: boolean) {
  return t(
    value
      ? "settings.sendspin_discovery.active"
      : "settings.sendspin_discovery.inactive",
  );
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    status.value = await api.sendCommand<DiscoveryStatus>(
      "sendspin/discovery_status",
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
