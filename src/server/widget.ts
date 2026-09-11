// 宿主返回结构化结果后渲染摘要；不依赖宿主自动唤醒会话。
export const summaryWidget = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><style>body{font:13px/1.8 system-ui;color:#24334c;padding:20px;margin:0}h2{font-size:18px;margin:0 0 6px}p{color:#8190a6}a{display:inline-block;color:white;background:#2563eb;padding:7px 14px;border-radius:6px;text-decoration:none}small{color:#8290a3}</style></head><body><h2>ProjectFlow</h2><p id="project">等待项目摘要…</p><small id="state">本地资产 · Codex 执行</small><p><a id="open" hidden target="_blank" rel="noreferrer">打开项目工作台</a></p><p>编辑与确认后，回到 Codex 发送“继续”。</p><script>
window.addEventListener('message',function(event){
 if(event.source!==window.parent||!event.data||event.data.jsonrpc!=='2.0')return;
 if(event.data.method!=='ui/notifications/tool-result')return;
 const data=event.data.params?.structuredContent;if(!data)return;
 document.getElementById('project').textContent=String(data.project?.name??'项目');
 document.getElementById('state').textContent=String(data.iterations?.length??0)+' 个迭代 · '+String(data.pending??0)+' 项待办';
 try{const url=new URL(data.url);if(url.protocol==='http:'&&url.hostname==='127.0.0.1'){const a=document.getElementById('open');a.href=url.href;a.hidden=false;}}catch{}
});
</script></body></html>`;
