import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
  buildPublishMessages,
  loadLoxBerryBrokerCredentials,
  publishWasteData,
  safeTopicSegment,
} from "../src-ts/lib/mqtt-publisher.js";
import type { WasteData } from "../src-ts/lib/types.js";

const sampleData: WasteData = {
  timestamp: "2026-04-26 09:00:00",
  standort: "Main Street 1",
  location: "Main Street 1",
  termine: {
    "Restabfall": { tage: 3, datum: "29.04.2026", wochentag: "Wednesday", wochentag_num: 3 },
    "Bio Tonne": { tage: 7, datum: "03.05.2026", wochentag: "Sunday", wochentag_num: 7 },
  },
};

describe("MQTT publisher", () => {
  it("normalises German umlauts and special chars in topic segments", () => {
    expect(safeTopicSegment("Restabfall")).to.equal("restabfall");
    expect(safeTopicSegment("Grünschnitt")).to.equal("gruenschnitt");
    expect(safeTopicSegment("Sperrmüll & Co.")).to.equal("sperrmuell_co");
    expect(safeTopicSegment("")).to.equal("unknown");
  });

  it("builds one set of topics per category plus state/last_fetch/location", () => {
    const messages = buildPublishMessages("loxberry/wasteapiio", sampleData);
    const topics = messages.map((m) => m.topic);
    expect(topics).to.include("loxberry/wasteapiio/state");
    expect(topics).to.include("loxberry/wasteapiio/last_fetch");
    expect(topics).to.include("loxberry/wasteapiio/location");
    expect(topics).to.include("loxberry/wasteapiio/categories_count");
    expect(topics).to.include("loxberry/wasteapiio/categories/restabfall/days");
    expect(topics).to.include("loxberry/wasteapiio/categories/restabfall/date");
    expect(topics).to.include("loxberry/wasteapiio/categories/restabfall/weekday");
    expect(topics).to.include("loxberry/wasteapiio/categories/restabfall/weekday_num");
    expect(topics).to.include("loxberry/wasteapiio/categories/bio_tonne/days");

    const daysMsg = messages.find((m) => m.topic === "loxberry/wasteapiio/categories/restabfall/days");
    expect(daysMsg?.payload).to.equal("3");
    const wnum = messages.find((m) => m.topic === "loxberry/wasteapiio/categories/restabfall/weekday_num");
    expect(wnum?.payload).to.equal("3");
    const stateMsg = messages.find((m) => m.topic === "loxberry/wasteapiio/state");
    expect(stateMsg).to.exist;
    expect(JSON.parse(stateMsg!.payload).standort).to.equal("Main Street 1");
  });

  it("returns disabled status when MQTT is turned off", async () => {
    const status = await publishWasteData({
      config: { enabled: false },
      data: sampleData,
    });
    expect(status.ok).to.equal(false);
    expect(status.message).to.equal("MQTT disabled");
  });

  it("publishes via the injected client and reports success", async () => {
    const published: { topic: string; payload: string; retain: boolean }[] = [];
    let ended = false;
    const status = await publishWasteData({
      config: {
        enabled: true,
        host: "broker.example",
        port: 18883,
        topic_prefix: "test/wasteapiio",
        retain: false,
        use_loxberry_broker: false,
      },
      data: sampleData,
      connect: async (args) => {
        expect(args.host).to.equal("broker.example");
        expect(args.port).to.equal(18883);
        return {
          publish: async (topic, payload, opts) => {
            published.push({ topic, payload, retain: opts.retain });
          },
          end: async () => {
            ended = true;
          },
        };
      },
    });
    expect(status.ok).to.equal(true);
    expect(status.broker).to.equal("mqtt://broker.example:18883");
    expect(published.length).to.equal(14);
    expect(status.topics_published).to.equal(published.length);
    expect(ended).to.equal(true);
    expect(published.every((m) => m.retain === false)).to.equal(true);
  });

  it("reports a useful error when the connect step throws", async () => {
    const status = await publishWasteData({
      config: { enabled: true, use_loxberry_broker: false, host: "x", port: 1883 },
      data: sampleData,
      connect: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(status.ok).to.equal(false);
    expect(status.message).to.equal("ECONNREFUSED");
  });

  it("auto-detects LoxBerry broker credentials from cred.json", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wasteapiio-mqtt-"));
    const credDir = path.join(tmp, "system", "storage", "mqtt");
    fs.mkdirSync(credDir, { recursive: true });
    fs.writeFileSync(
      path.join(credDir, "cred.json"),
      JSON.stringify({
        brokerhost: "lb-broker.local",
        brokerport: 18831,
        brokeruser: "loxberry",
        brokerpass: "secret",
      }),
    );
    const detected = loadLoxBerryBrokerCredentials(tmp);
    expect(detected).to.not.equal(null);
    expect(detected!.host).to.equal("lb-broker.local");
    expect(detected!.port).to.equal(18831);
    expect(detected!.user).to.equal("loxberry");
    expect(detected!.password).to.equal("secret");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("auto-detects LoxBerry broker credentials from general.json (LoxBerry 3 layout)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wasteapiio-mqtt2-"));
    const cfgDir = path.join(tmp, "config", "system");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, "general.json"),
      JSON.stringify({
        Mqtt: {
          Brokerhost: "127.0.0.1",
          Brokerport: "1883",
          Brokeruser: "loxberry",
          Brokerpass: "fake-broker-password-for-tests",
          UseLocalBroker: true,
        },
      }),
    );
    const detected = loadLoxBerryBrokerCredentials(tmp);
    expect(detected).to.not.equal(null);
    expect(detected!.host).to.equal("127.0.0.1");
    expect(detected!.port).to.equal(1883);
    expect(detected!.user).to.equal("loxberry");
    expect(detected!.password).to.equal("fake-broker-password-for-tests");
    expect(detected!.source).to.match(/general\.json$/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("splits combined host:port broker address", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wasteapiio-mqtt3-"));
    const cfgDir = path.join(tmp, "config", "system");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, "general.json"),
      JSON.stringify({
        Mqtt: {
          Brokeraddress: "broker.example:18883",
          Brokeruser: "u",
          Brokerpass: "p",
        },
      }),
    );
    const detected = loadLoxBerryBrokerCredentials(tmp);
    expect(detected).to.not.equal(null);
    expect(detected!.host).to.equal("broker.example");
    expect(detected!.port).to.equal(18883);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
