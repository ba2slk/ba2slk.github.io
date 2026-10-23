---
layout: list
title: Articles
permalink: /articles/
---
{%- assign items = site.posts | where_exp: "p", "p.book == nil" -%}
{%- if items.size > 0 %}
{% include posts-by-year.html posts=items %}
{%- else %}
<p class="empty">No articles yet.</p>
{%- endif %}
