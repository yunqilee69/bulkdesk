#define GOOGLE_NAMESPACE google
#define HAVE_DLADDR 1
#define HAVE_DLFCN_H 1
#define HAVE_EXECINFO_H 1
#define HAVE_FCNTL 1
#define HAVE_GLOB_H 1
#define HAVE_INTTYPES_H 1
#define HAVE_LIBPTHREAD 1
#define HAVE_LIBUNWIND_H 1
#define HAVE_MEMORY_H 1
#define HAVE_NAMESPACES 1
#define HAVE_PREAD 1
#define HAVE_PTHREAD 1
#define HAVE_PWD_H 1
#define HAVE_PWRITE 1
#define HAVE_RWLOCK 1
#define HAVE_SIGACTION 1
#define HAVE_SIGALTSTACK 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRINGS_H 1
#define HAVE_STRING_H 1
#define HAVE_SYSLOG_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_SYSCALL_H 1
#define HAVE_SYS_TIME_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_SYS_UCONTEXT_H 1
#define HAVE_SYS_UTSNAME_H 1
#define HAVE_UNISTD_H 1
#define HAVE_UNWIND_H 1
#define HAVE_USING_OPERATOR 1
#define HAVE___ATTRIBUTE__ 1
#define HAVE___BUILTIN_EXPECT 1
#define HAVE___SYNC_VAL_COMPARE_AND_SWAP 1
#define LT_OBJDIR ".libs/"
#define PACKAGE "glog"
#define PACKAGE_BUGREPORT "opensource@google.com"
#define PACKAGE_NAME "glog"
#define PACKAGE_STRING "glog 0.3.5"
#define PACKAGE_TARNAME "glog"
#define PACKAGE_URL ""
#define PACKAGE_VERSION "0.3.5"
#define SIZEOF_VOID_P 8
#define STL_NAMESPACE std
#define TEST_SRC_DIR "."
#define VERSION "0.3.5"
#define _END_GOOGLE_NAMESPACE_ }
#define _START_GOOGLE_NAMESPACE_ namespace google {

#ifdef __APPLE__
#include <TargetConditionals.h>
#include <Availability.h>
#endif

#if TARGET_OS_TV
#undef HAVE_SYSCALL_H
#undef HAVE_SYS_SYSCALL_H
#undef OS_MACOSX
#define NO_THREADS
#endif

#undef HAVE_UCONTEXT_H
#undef PC_FROM_UCONTEXT
#if defined(__x86_64__)
#define PC_FROM_UCONTEXT uc_mcontext->__ss.__rip
#elif defined(__i386__)
#define PC_FROM_UCONTEXT uc_mcontext->__ss.__eip
#endif
