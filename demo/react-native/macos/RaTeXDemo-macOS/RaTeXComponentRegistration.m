// RaTeXComponentRegistration.m
// Registers RaTeX Fabric component providers on the macOS demo app without
// method swizzling. We provide a custom dependency provider subclass and let
// AppDelegate instantiate it directly.

#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@interface RCTAppDependencyProvider (RaTeXThirdPartyComponents)
- (NSDictionary<NSString *, Class> *)thirdPartyFabricComponents;
@end

@interface RaTeXAppDependencyProvider : RCTAppDependencyProvider
@end

@implementation RaTeXAppDependencyProvider

- (NSDictionary<NSString *, Class> *)thirdPartyFabricComponents {
    NSMutableDictionary<NSString *, Class> *components = [NSMutableDictionary dictionary];

    Method baseMethod =
        class_getInstanceMethod([RCTAppDependencyProvider class], @selector(thirdPartyFabricComponents));
    if (baseMethod != NULL) {
        NSDictionary<NSString *, Class> *base = [super thirdPartyFabricComponents];
        if (base != nil) {
            [components addEntriesFromDictionary:base];
        }
    }

    Class ratexViewCls = NSClassFromString(@"RaTeXViewComponentView");
    if (ratexViewCls != Nil && components[@"RaTeXView"] == nil) {
        components[@"RaTeXView"] = ratexViewCls;
    }

    Class inlineViewCls = NSClassFromString(@"RaTeXInlineViewComponentView");
    if (inlineViewCls != Nil && components[@"RaTeXInlineView"] == nil) {
        components[@"RaTeXInlineView"] = inlineViewCls;
    }

    return [components copy];
}

@end

RCTAppDependencyProvider *RaTeXCreateAppDependencyProvider(void) {
    return [RaTeXAppDependencyProvider new];
}
