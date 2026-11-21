<template>
  <div class="card flex flex-col items-center gap-3 py-12 text-center">
    <div class="text-3xl font-semibold">404</div>
    <div class="text-sm font-medium">页面不存在</div>
    <p class="max-w-md text-sm text-slate-500">这个地址没有对应的页面，可能是链接过期或输入错误。</p>
    <RouterLink to="/" class="btn-primary">返回总览</RouterLink>
  </div>
</template>
