# PlagLens — white-labelled Grafana.
# Thin layer over the official image: swaps the Grafana mark for the PlagLens
# tile and rebrands the app/login title. Everything else (datasources,
# dashboards) stays provisioned via mounted volumes.
FROM grafana/grafana:11.2.0

USER root

# Menu / login / loading mark -> PlagLens tile.
COPY branding/grafana_icon.svg /usr/share/grafana/public/img/grafana_icon.svg

# Best-effort title rebrand. Built JS filenames are content-hashed and the
# templating can change between releases, so every substitution tolerates a
# miss (|| true) — a missed title never breaks the image, the logo still wins.
RUN set -eux; \
    cd /usr/share/grafana/public; \
    sed -i 's/\[\[\.AppTitle\]\]/PlagLens/g' views/index.html || true; \
    sed -i 's/\[\[\.LoginTitle\]\]/PlagLens/g' views/index.html || true; \
    for f in build/app.*.js; do \
      [ -f "$f" ] && sed -i 's/"Welcome to Grafana"/"PlagLens · мониторинг"/g' "$f" || true; \
    done; \
    true

USER grafana
