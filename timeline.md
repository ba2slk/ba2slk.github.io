---
layout: list
title: Timeline
permalink: /timeline/
---
{%- assign years = site.posts | group_by_exp: 'p', "p.date | date: '%Y'" -%}
{%- for year in years %}
<h2 class="year mono">{{ year.name }}</h2>
<ol class="timeline">
{%- for post in year.items %}
{%- assign book = nil -%}{%- if post.book %}{% assign book = site.books | where: 'slug', post.book | first %}{% endif %}
<li>
  <span class="tl-dot" aria-hidden="true"></span>
  <a class="tl-item" href="{{ post.url | relative_url }}">
    <div class="tl-body">
      <time class="mono" datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: '%m/%d' }}</time>
      <h3>{{ post.title }}</h3>
      <span class="kind">{% if book %}{{ book.title }}{% else %}Article{% endif %}</span>
    </div>
    {% include thumb.html post=post book=book %}
  </a>
</li>
{%- endfor %}
</ol>
{%- endfor %}
